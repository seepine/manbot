import { DynamicStructuredTool } from 'langchain'
import { z } from 'zod'
import { buildAgent } from '../../bot/build-agent'
import { randomUUIDv7 } from 'bun'

interface SubAgentTask {
  status: 'pending' | 'completed' | 'failed'
  content?: string
  error?: string
  createdAt: number
}

const tasks = new Map<string, SubAgentTask>()

// 清理超过1小时的已完成任务，防止内存泄漏
const cleanupTasks = () => {
  const now = Date.now()
  const maxAge = 60 * 60 * 1000 // 1小时
  for (const [id, task] of tasks.entries()) {
    if (now - task.createdAt > maxAge && task.status !== 'pending') {
      tasks.delete(id)
    }
  }
}

/**
 * 创建子代理工具集
 * @returns 子代理工具数组
 */
export const createSubAgentTools = () => {
  return [
    new DynamicStructuredTool({
      name: 'launch_sub_agent',
      description:
        'Launch an autonomous sub-agent to handle complex tasks independently. This is asynchronous - use this tool to start the agent, then use query_sub_agent to check its status and retrieve results.',
      schema: z.object({
        systemPrompt: z
          .string()
          .describe(
            "The system prompt describing the agent's role, expertise, and behavior guidelines.",
          ),
        userMessage: z.string().describe('The question for the agent to work on.'),
      }),
      func: async ({ systemPrompt, userMessage }) => {
        const taskId = randomUUIDv7()
        const task: SubAgentTask = { status: 'pending', createdAt: Date.now() }
        tasks.set(taskId, task)

        // 异步执行，不阻塞主线程
        void (async () => {
          try {
            const agent = await buildAgent({
              additionalSystemPrompt: systemPrompt,
            })
            let fullContent = ''
            for await (const chunk of agent.streamEvents({
              messages: [{ role: 'user', content: userMessage }],
            })) {
              if (chunk.event === 'on_chat_model_stream') {
                fullContent += chunk.data?.chunk?.content ?? ''
              }
            }
            task.status = 'completed'
            task.content = fullContent
          } catch (err) {
            task.status = 'failed'
            task.error = err instanceof Error ? err.message : String(err)
          } finally {
            cleanupTasks()
          }
        })()

        return `Sub-agent launched with ID: ${taskId}. Use query_sub_agent to check status and retrieve results.`
      },
    }),
    new DynamicStructuredTool({
      name: 'query_sub_agent',
      description:
        'Check the status and results of a running sub-agent. Returns pending status if still running, or completed/failed status with results.',
      schema: z.object({
        agentId: z.string().describe('The task ID returned by launch_sub_agent.'),
      }),
      func: async ({ agentId }) => {
        const task = tasks.get(agentId)
        if (!task) {
          return {
            status: 'error',
            error: `Task with ID ${agentId} not found. It may have expired or been cleaned up.`,
          }
        }
        if (task.status === 'pending') {
          return {
            status: 'pending',
            message: 'The agent is still working. Please query again in a moment.',
          }
        }
        return {
          status: task.status,
          content: task.content,
          error: task.error,
        }
      },
    }),
  ]
}

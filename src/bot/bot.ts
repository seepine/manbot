import { createAgent, createMiddleware, DynamicStructuredTool } from 'langchain'
import { ChatOpenAICompletions } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { loadMcpTools, type McpToolsResult } from './mcp-loader.ts'
import { buildSkillsPrompt, loadSkills } from './skills-loader.ts'
import { loadPromptTools } from './prompt-loader.ts'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { createTaskTool, startTasksProcess } from './task-manager.ts'
import { systemInnerTools } from './tools/system.ts'
import { createInnerMcpTools } from './tools/mcp.ts'
import { createDownloadTools } from './tools/download.ts'
import { readHistoryMessages, saveHistoryMessages } from './utils/history.ts'
import { ToolRegistry } from './tool-registry.ts'
import { createSubAgentTools } from './tools/sub-agent.ts'

const {
  WORKSPACE_FOLDER = './workspace',
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  OPENAI_MODEL,
  OPENAI_TIMEOUT = '120000',
  OPENAI_TEMPERATURE = '0.7',
  OPENAI_TOP_P = '0.9',
  RECURSION_LIMIT = '100',
  AUTO_TOOL_DISCOVERY = 'false',
  ANTHROPIC_AUTH_TOKEN,
  ANTHROPIC_BASE_URL = 'https://api.anthropic.com',
  ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022',
} = process.env

const useAnthropic = Boolean(ANTHROPIC_AUTH_TOKEN)

if (!useAnthropic && (!OPENAI_API_KEY || !OPENAI_BASE_URL || !OPENAI_MODEL)) {
  console.error('请在 .env 文件中设置 OPENAI_API_KEY OPENAI_BASE_URL 和 OPENAI_MODEL')
  process.exit(1)
}

const workspaceDir = WORKSPACE_FOLDER.startsWith('./')
  ? join(process.cwd(), WORKSPACE_FOLDER)
  : WORKSPACE_FOLDER
if (!existsSync(workspaceDir)) {
  mkdirSync(workspaceDir, { recursive: true })
}

const parseInteger = (raw: string, fallback: number): number => {
  const value = Number.parseInt(raw, 10)
  return Number.isNaN(value) ? fallback : value
}

const parseDecimal = (raw: string, fallback: number): number => {
  const value = Number(raw)
  return Number.isNaN(value) ? fallback : value
}

const recursionLimit = parseInteger(RECURSION_LIMIT, 100)
const openaiTimeout = parseInteger(OPENAI_TIMEOUT, 120000)
const openaiTemperature = parseDecimal(OPENAI_TEMPERATURE, 0.7)
const openaiTopP = parseDecimal(OPENAI_TOP_P, 0.9)

let innerMcpTools: McpToolsResult | null = null
const toolDiscoveryEnabled = AUTO_TOOL_DISCOVERY === 'true'

const createModel = () => {
  if (useAnthropic) {
    return new ChatAnthropic({
      apiKey: ANTHROPIC_AUTH_TOKEN,
      anthropicApiUrl: ANTHROPIC_BASE_URL,
      model: ANTHROPIC_MODEL,
      streaming: true,
      temperature: openaiTemperature,
      topP: openaiTopP,
    })
  }
  return new ChatOpenAICompletions({
    apiKey: OPENAI_API_KEY,
    configuration: { baseURL: OPENAI_BASE_URL },
    modelName: OPENAI_MODEL,
    streaming: true,
    temperature: openaiTemperature,
    topP: openaiTopP,
    timeout: openaiTimeout,
  })
}

startTasksProcess(workspaceDir)

const stringifyToolInput = (value: unknown): string => {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return String(value ?? '{}')
  }
}

export const buildAgent = async (
  opts: {
    /**
     * 额外的工具
     */
    additionalTools?: DynamicStructuredTool[]
    /**
     * 额外的系统提示词
     */
    additionalSystemPrompt?: string
  } = {},
) => {
  if (!innerMcpTools) {
    innerMcpTools = await createInnerMcpTools(workspaceDir)
  }

  const [skills, prompt] = await Promise.all([
    loadSkills(workspaceDir),
    loadPromptTools(workspaceDir),
  ])
  let systemPrompt = `${prompt}\n${buildSkillsPrompt(skills)}`

  const llm = createModel()

  const tools = [...systemInnerTools, ...createDownloadTools(workspaceDir), ...innerMcpTools?.tools]

  const mcpTools = await loadMcpTools(workspaceDir)

  if (toolDiscoveryEnabled && mcpTools?.tools?.length) {
    // 工具自动发现模式：用户 MCP 工具通过注册表按需发现
    const toolRegistry = new ToolRegistry()
    toolRegistry.register(mcpTools.tools)
    tools.push(...toolRegistry.createProxyTools())
    systemPrompt += `\n${toolRegistry.getToolsPrompt()}`
  } else {
    tools.push(...(mcpTools?.tools || []))
  }

  if (opts.additionalTools) {
    tools.push(...opts.additionalTools)
  }

  if (opts.additionalSystemPrompt) {
    systemPrompt += `\n${opts.additionalSystemPrompt}`
  }
  return createAgent({
    model: llm,
    tools,
    systemPrompt,
    middleware: [
      createMiddleware({
        name: 'clear_tools_state_after_agent',
        async afterAgent() {
          try {
            await mcpTools.client?.close()
          } catch {}
        },
      }),
    ],
  })
}

export const handlerMessage = async (
  type: 'feishu',
  chatId: string,
  content: string,
  senderUnionId: string,
  reply: (replyContent: string, isEnd?: boolean) => void | Promise<void>,
) => {
  const agent = await buildAgent({
    additionalTools: [...createSubAgentTools(), ...createTaskTool(type, chatId, senderUnionId)],
  })
  const history = await readHistoryMessages(workspaceDir, chatId)

  const queue: string[] = []
  let isStreamEnded = false
  // 消息接收起另一个线程
  const streamProcess = new Promise<void>(async (res) => {
    try {
      const stream = agent.streamEvents(
        { messages: [...history, { role: 'user', content }] },
        { version: 'v2', recursionLimit },
      )
      let isThinking = false
      for await (const event of stream) {
        if (event.event === 'on_chat_model_stream') {
          const chunk = event.data?.chunk
          const content = chunk?.content
          // 兼容 OpenAI 格式（content 是 string）和 Anthropic 格式（content 是数组）
          if (typeof content === 'string') {
            queue.push(content)
          } else if (useAnthropic && Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'thinking') {
                if (!isThinking) {
                  isThinking = true
                  queue.push('\n> [思考中...]\n> ')
                }
                queue.push(item.thinking || '')
              } else if (item.type === 'text') {
                // 思考结束时，先推送思考内容，再推送文本
                if (isThinking) {
                  queue.push('\n')
                  isThinking = false
                }
                if (typeof item.text === 'string') {
                  queue.push(item.text)
                }
              }
            }
          }
        } else if (event.event === 'on_tool_start') {
          queue.push(`\n> [调用工具: ${event.name}]\n`)
          queue.push(`> ${stringifyToolInput(event.data?.input ?? event.data ?? {})}\n\n`)
        } else if (event.event === 'on_tool_end') {
          queue.push(`\n> [工具 ${event.name} 返回完毕]\n\n`)
        }
      }
    } catch (err) {
      console.error(err)
      queue.push('\n[错误]' + (err instanceof Error ? err.message : err))
    } finally {
      isStreamEnded = true
      res()
    }
  }).then()

  let fullContent = ''
  let waitCount = 1
  while (!isStreamEnded || queue.length > 0) {
    if (queue.length === 0) {
      await Bun.sleep(waitCount * 50)
      waitCount = Math.min(waitCount + 1, 20)
      continue
    }
    waitCount = 1
    const msg = queue.splice(0, queue.length).join('')
    if (msg.length > 0) {
      fullContent += msg
      await reply(msg)
    }
  }
  await streamProcess
  await reply('', true)
  if (fullContent) {
    await saveHistoryMessages(workspaceDir, chatId, [
      { role: 'user', content },
      { role: 'assistant', content: fullContent },
    ])
  }
}

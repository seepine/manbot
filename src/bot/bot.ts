import { createAgent, DynamicStructuredTool } from 'langchain'
import { ChatOpenAI } from '@langchain/openai'
import { loadMcpTools, mcpToolsHasChanged, type McpToolsResult } from './mcp-loader.ts'
import { buildSkillsPrompt, loadSkills } from './skills-loader.ts'
import { loadPromptTools } from './prompt-loader.ts'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import type { BaseMessageLike } from '@langchain/core/messages'
import { createTaskTool, startTasksProcess } from './task-manager.ts'
import { systemInnerTools } from './tools/system.ts'
import { createInnerMcpTools } from './tools/mcp.ts'

const {
  WORKSPACE_FOLDER = './workspace',
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  OPENAI_MODEL,
  RECURSION_LIMIT = '100',
  MAX_MESSAGES = '50',
} = process.env

if (!OPENAI_API_KEY || !OPENAI_BASE_URL || !OPENAI_MODEL) {
  console.error('请在 .env 文件中设置 OPENAI_API_KEY OPENAI_BASE_URL 和 OPENAI_MODEL')
  process.exit(1)
}

const workspaceDir = WORKSPACE_FOLDER.startsWith('./')
  ? join(process.cwd(), WORKSPACE_FOLDER)
  : WORKSPACE_FOLDER
if (!existsSync(workspaceDir)) {
  mkdirSync(workspaceDir, { recursive: true })
}

const recursionLimit = parseInt(RECURSION_LIMIT, 10)
const maxMessages = parseInt(MAX_MESSAGES, 10)

let mcpTools: McpToolsResult | null = null
let innerMcpTools: McpToolsResult | null = null

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
  startTasksProcess(workspaceDir)

  if (!innerMcpTools) {
    innerMcpTools = await createInnerMcpTools(workspaceDir)
  }

  if (await mcpToolsHasChanged(workspaceDir)) {
    await mcpTools?.client?.close().catch(() => {})
    mcpTools = await loadMcpTools(workspaceDir)
  }

  const [skills, prompt] = await Promise.all([
    loadSkills(workspaceDir),
    loadPromptTools(workspaceDir),
  ])

  const llm = new ChatOpenAI({
    apiKey: OPENAI_API_KEY,
    configuration: { baseURL: OPENAI_BASE_URL },
    modelName: OPENAI_MODEL,
    streaming: true,
  })

  const tools = [...systemInnerTools, ...innerMcpTools?.tools, ...(mcpTools?.tools || [])]

  if (opts.additionalTools) {
    tools.push(...opts.additionalTools)
  }

  let systemPrompt = `${prompt}\n${buildSkillsPrompt(skills)}`
  if (opts.additionalSystemPrompt) {
    systemPrompt += `\n${opts.additionalSystemPrompt}`
  }
  return createAgent({ model: llm, tools, systemPrompt })
}

const chatMessageHistory: {
  [chatId: string]: BaseMessageLike[]
} = {}

export const handlerMessage = async (
  type: 'feishu',
  chatId: string,
  content: string,
  senderUnionId: string,
  reply: (replyContent: string, isEnd?: boolean) => void | Promise<void>,
) => {
  const agent = await buildAgent({ additionalTools: createTaskTool(type, chatId, senderUnionId) })
  const history = chatMessageHistory[chatId] || []
  try {
    const stream = agent.streamEvents(
      { messages: [...history, { role: 'user', content }] },
      { version: 'v2', recursionLimit },
    )
    let fullContent = ''
    for await (const event of stream) {
      if (event.event === 'on_chat_model_stream') {
        const content = event.data?.chunk?.content
        if (typeof content === 'string') {
          await reply(content)
          fullContent += content
        }
      } else if (event.event === 'on_tool_start') {
        await reply(`\n> [调用工具: ${event.name}]\n`)
        await reply(`> ${JSON.stringify(event.data.input ?? event.data ?? {})}\n`)
      } else if (event.event === 'on_tool_end') {
        await reply(`\n> [工具 ${event.name} 返回完毕]\n`)
      }
    }
    if (fullContent) {
      history.push({ role: 'user', content })
      history.push({ role: 'assistant', content: fullContent })
      while (history.length > maxMessages) {
        history.shift()
      }
      chatMessageHistory[chatId] = history
    }
  } catch (err) {
    await reply('\n[错误]' + (err instanceof Error ? err.message : err))
  } finally {
    await reply('', true)
  }
}

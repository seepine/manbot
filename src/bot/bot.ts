import { createAgent, DynamicStructuredTool } from 'langchain'
import { ChatOpenAICompletions } from '@langchain/openai'
import { loadMcpTools, mcpToolsHasChanged, type McpToolsResult } from './mcp-loader.ts'
import { buildSkillsPrompt, loadSkills } from './skills-loader.ts'
import { loadPromptTools } from './prompt-loader.ts'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import type { BaseMessageLike } from '@langchain/core/messages'
import { createTaskTool, startTasksProcess } from './task-manager.ts'
import { systemInnerTools } from './tools/system.ts'
import { createInnerMcpTools } from './tools/mcp.ts'
import { createDownloadTools } from './tools/download.ts'
import { readHistoryMessages, saveHistoryMessages } from './utils/history.ts'
import { ToolRegistry } from './tool-registry.ts'

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

let mcpTools: McpToolsResult | null = null
let innerMcpTools: McpToolsResult | null = null
const toolRegistry = new ToolRegistry()
const toolDiscoveryEnabled = AUTO_TOOL_DISCOVERY === 'true'

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

  const llm = new ChatOpenAICompletions({
    apiKey: OPENAI_API_KEY,
    configuration: { baseURL: OPENAI_BASE_URL },
    modelName: OPENAI_MODEL,
    streaming: true,
    temperature: Number(OPENAI_TEMPERATURE),
    topP: Number(OPENAI_TOP_P),
    timeout: Number(OPENAI_TIMEOUT),
  })

  const tools = [...systemInnerTools, ...createDownloadTools(workspaceDir), ...innerMcpTools?.tools]

  if (toolDiscoveryEnabled && mcpTools?.tools?.length) {
    // 工具自动发现模式：用户 MCP 工具通过注册表按需发现
    toolRegistry.register(mcpTools.tools)
    tools.push(...toolRegistry.createProxyTools())
  } else {
    tools.push(...(mcpTools?.tools || []))
  }

  if (opts.additionalTools) {
    tools.push(...opts.additionalTools)
  }

  let systemPrompt = `${prompt}\n${buildSkillsPrompt(skills)}`
  if (opts.additionalSystemPrompt) {
    systemPrompt += `\n${opts.additionalSystemPrompt}`
  }
  return createAgent({ model: llm, tools, systemPrompt })
}

export const handlerMessage = async (
  type: 'feishu',
  chatId: string,
  content: string,
  senderUnionId: string,
  reply: (replyContent: string, isEnd?: boolean) => void | Promise<void>,
) => {
  const agent = await buildAgent({
    additionalTools: [...createTaskTool(type, chatId, senderUnionId)],
  })
  const history = await readHistoryMessages(workspaceDir, chatId)
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
      await saveHistoryMessages(workspaceDir, chatId, [
        { role: 'user', content },
        { role: 'assistant', content: fullContent },
      ])
    }
  } catch (err) {
    await reply('\n[错误]' + (err instanceof Error ? err.message : err))
  } finally {
    await reply('', true)
  }
}

import { createAgent, createMiddleware, ReactAgent, type DynamicStructuredTool } from 'langchain'
import { ChatOpenAICompletions } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { existsSync, mkdirSync } from 'node:fs'
import { Channel, type MessageContent } from '../channels/channel.ts'
import type { ProviderConfig, AgentConfig, AgentProviderConfig } from '../config/types.ts'
import { loadMcpTools, type McpToolsResult } from './mcp-loader.ts'
import { loadPromptTools } from './prompt-loader.ts'
import { createTaskTool, startTasksProcess } from './task-manager.ts'
import { systemInnerTools } from './tools/system.ts'
import { createInnerMcpTools } from './tools/mcp.ts'
import { createDownloadTools } from './tools/download.ts'
import { readHistoryMessages, saveHistoryMessages } from './utils/history.ts'
import { ToolRegistry } from './tool-registry.ts'
import { createSkillsTools } from './tools/skills.ts'
import { createSubAgentTools } from './tools/sub-agent.ts'

export class Agent {
  private innerMcpTools: McpToolsResult | null = null
  private workspace: string
  private provider: ProviderConfig & AgentProviderConfig
  private isRunning = false

  constructor(
    private opts: {
      name: string
      provider: ProviderConfig
      config: AgentConfig
      channel: Channel
    },
  ) {
    this.provider = {
      ...opts.provider,
      ...opts.config.provider,
    }
    this.workspace = opts.config['workspace-dir'] || `workspace-${this.opts.name}`
    if (!existsSync(this.workspace)) {
      mkdirSync(this.workspace, { recursive: true })
    }
    // startTasksProcess(opts.workspace, opts.channelConfig)
  }

  private createModel() {
    const provider = this.provider
    if (provider.type === 'anthropic') {
      return new ChatAnthropic({
        apiKey: provider['api-key'],
        anthropicApiUrl: provider['base-url'] || 'https://api.anthropic.com',
        model: provider.model,
        streaming: true,
        temperature: provider.temperature ?? 0.7,
        topP: provider['top-p'] ?? 0.9,
      })
    }
    return new ChatOpenAICompletions({
      apiKey: provider['api-key'],
      configuration: { baseURL: provider['base-url'] },
      modelName: provider.model,
      streaming: true,
      temperature: provider.temperature ?? 0.7,
      topP: provider['top-p'] ?? 0.9,
      timeout: provider.timeout ?? 120000,
    })
  }

  async createAgent(
    opts: {
      additionalTools?: DynamicStructuredTool[]
      additionalSystemPrompt?: string
    } = {},
  ): Promise<ReactAgent> {
    const workspace = this.workspace
    const provider = this.provider

    const innerMcpTools = await createInnerMcpTools(workspace)
    const [prompt] = await Promise.all([loadPromptTools(workspace)])

    const tools = [
      ...systemInnerTools,
      ...createDownloadTools(workspace),
      ...createSkillsTools(workspace),
      ...((this.innerMcpTools?.tools ?? []) as DynamicStructuredTool[]),
    ]

    const mcpTools = await loadMcpTools(workspace)
    if (provider['auto-tool-discovery'] && mcpTools?.tools?.length) {
      const toolRegistry = new ToolRegistry()
      toolRegistry.register(mcpTools.tools)
      tools.push(...toolRegistry.createProxyTools())
    } else {
      tools.push(...((mcpTools?.tools ?? []) as DynamicStructuredTool[]))
    }

    // Add additional
    const { additionalTools = [], additionalSystemPrompt = '' } = opts

    // Add additional tools
    tools.push(...additionalTools)
    const systemPrompt = additionalSystemPrompt ? `${prompt}\n\n${additionalSystemPrompt}` : prompt

    return createAgent({
      model: this.createModel(),
      tools: tools,
      systemPrompt: systemPrompt,
      middleware: [
        createMiddleware({
          name: 'clear_tools_state_after_agent',
          async afterAgent() {
            try {
              await innerMcpTools?.client?.close()
            } catch {}
          },
        }),
      ],
    })
  }

  private stringifyToolInput(value: unknown): string {
    try {
      return JSON.stringify(value ?? {})
    } catch {
      return String(value ?? '{}')
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return
    }
    await this.opts.channel.start((content, info, reply) =>
      this.handleMessage(content, info, reply),
    )
    this.isRunning = true
    console.log(`agent "${this.opts.name}" started`)
  }

  private queueContent: {
    [chatId: string]: Array<MessageContent>
  } = {}
  private queueRunningState: {
    [chatId: string]: boolean
  } = {}

  private async handleMessage(
    content: Array<MessageContent>,
    info: {
      chatId: string
      groupId?: string
      senderId: string
    },
    reply: (content: Array<MessageContent>, isEnd?: boolean) => void | Promise<void>,
  ): Promise<void> {
    if (this.queueRunningState[info.chatId]) {
      this.queueContent[info.chatId] = {
        ...this.queueContent[info.chatId],
        ...content,
      }
      return
    }
    const allContent = [...(this.queueContent[info.chatId] || []), ...content]
    this.queueContent[info.chatId] = []
    this.queueRunningState[info.chatId] = true

    const workspace = this.workspace
    const provider = this.provider
    const history = await readHistoryMessages(workspace, info.chatId)
    const showThinkingEnabled = provider['show-thinking'] ?? false

    const queue: { type: 'thinking' | 'text' | 'tool_start' | 'tool_end'; content?: string }[] = []
    let isStreamEnded = false

    const streamProcess = new Promise<void>(async (res) => {
      try {
        const additionalTools = [
          ...createSubAgentTools(),
          ...createTaskTool(this.opts.channel.type as 'feishu', info.chatId, info.senderId),
        ]

        const agent = await this.createAgent({
          additionalTools,
        })

        const stream = agent.streamEvents(
          {
            messages: [
              ...history,
              // 单次处理多条数据
              ...allContent.map((item) => {
                return { role: 'user', content: item }
              }),
            ],
          },
          { version: 'v2', recursionLimit: provider['recursion-limit'] ?? 100 },
        )

        let isThinking = false
        for await (const event of stream) {
          if (event.event === 'on_chat_model_stream') {
            const chunk = event.data?.chunk
            const content = chunk?.content
            if (typeof content === 'string') {
              queue.push({ type: 'text', content })
            } else if (provider.type === 'anthropic' && Array.isArray(content)) {
              for (const item of content) {
                if (item.type === 'thinking') {
                  if (!isThinking) {
                    isThinking = true
                    queue.push({ type: 'thinking', content: '\n> [思考中...]\n\n' })
                    if (showThinkingEnabled) queue.push({ type: 'thinking', content: '> ' })
                  }
                  if (showThinkingEnabled)
                    queue.push({ type: 'thinking', content: item.thinking || '' })
                } else if (item.type === 'text') {
                  if (isThinking) {
                    queue.push({ type: 'thinking', content: '\n\n' })
                    isThinking = false
                  }
                  if (typeof item.text === 'string')
                    queue.push({ type: 'text', content: item.text })
                }
              }
            }
          } else if (event.event === 'on_tool_start') {
            queue.push({ type: 'tool_start', content: `\n> [调用工具: ${event.name}]\n` })
            queue.push({
              type: 'tool_start',
              content: `> ${this.stringifyToolInput(event.data?.input ?? event.data ?? {})}\n\n`,
            })
          } else if (event.event === 'on_tool_end') {
            queue.push({ type: 'tool_end', content: `\n> [工具 ${event.name} 返回完毕]\n\n` })
          }
        }
      } catch (err) {
        console.error(err)
        queue.push({
          type: 'text',
          content: '\n[错误]' + (err instanceof Error ? err.message : err),
        })
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
      const popMessage = queue.splice(0, queue.length)
      if (popMessage.length > 0) {
        const sendMsg = popMessage.map((item) => item.content).join('')
        await reply([sendMsg])
        const usefulContent = popMessage
          .filter((item) => item.type === 'text')
          .map((item) => item.content)
          .join('')
        fullContent += usefulContent || ''
      }
    }
    try {
      await streamProcess
      await reply([''], true)
      if (fullContent) {
        await saveHistoryMessages(workspace, info.chatId, [
          { role: 'user', content: content[0] ?? '' },
          { role: 'assistant', content: fullContent },
        ])
      }
    } catch (e) {
    } finally {
      this.queueRunningState[info.chatId] = false
    }
  }
}

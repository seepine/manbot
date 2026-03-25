import { createAgent, createMiddleware, type DynamicStructuredTool } from 'langchain'
import { ChatOpenAICompletions } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { existsSync, mkdirSync } from 'node:fs'
import { Channel } from '../channels/channel.ts'
import type { ProviderConfig } from '../config/types.ts'
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
  private llm: ReturnType<typeof this.createModel>
  private tools: DynamicStructuredTool[] = []
  private agent: ReturnType<typeof createAgent> | null = null
  private innerMcpTools: McpToolsResult | null = null

  constructor(private opts: {
    name: string
    config: ProviderConfig
    workspace: string
    channel: Channel
  }) {
    this.initWorkspace()
    startTasksProcess(opts.workspace)
    this.llm = this.createModel()
  }

  private initWorkspace(): void {
    if (!existsSync(this.opts.workspace)) {
      mkdirSync(this.opts.workspace, { recursive: true })
    }
  }

  private createModel() {
    const { config } = this.opts
    if (config.type === 'anthropic') {
      return new ChatAnthropic({
        apiKey: config['api-key'],
        anthropicApiUrl: config['base-url'] || 'https://api.anthropic.com',
        model: config.model,
        streaming: true,
        temperature: config.temperature ?? 0.7,
        topP: config['top-p'] ?? 0.9,
      })
    }
    return new ChatOpenAICompletions({
      apiKey: config['api-key'],
      configuration: { baseURL: config['base-url'] },
      modelName: config.model,
      streaming: true,
      temperature: config.temperature ?? 0.7,
      topP: config['top-p'] ?? 0.9,
      timeout: config.timeout ?? 120000,
    })
  }

  async loadTools(): Promise<void> {
    const { workspace, config } = this.opts

    this.innerMcpTools = await createInnerMcpTools(workspace)
    const [prompt] = await Promise.all([loadPromptTools(workspace)])

    this.tools = [
      ...systemInnerTools,
      ...createDownloadTools(workspace),
      ...createSkillsTools(workspace),
      ...(this.innerMcpTools?.tools ?? []),
    ]

    const mcpTools = await loadMcpTools(workspace)
    if (config['auto-tool-discovery'] && mcpTools?.tools?.length) {
      const toolRegistry = new ToolRegistry()
      toolRegistry.register(mcpTools.tools)
      this.tools.push(...toolRegistry.createProxyTools())
    } else {
      this.tools.push(...(mcpTools?.tools ?? []))
    }

    this.agent = createAgent({
      model: this.llm,
      tools: this.tools,
      systemPrompt: prompt,
      middleware: [this.createMiddleware()],
    })
  }

  private createMiddleware() {
    const innerMcpTools = this.innerMcpTools
    return createMiddleware({
      name: 'clear_tools_state_after_agent',
      async afterAgent() {
        try {
          await innerMcpTools?.client?.close()
        } catch {}
      },
    })
  }

  async start(): Promise<void> {
    await this.loadTools()
    await this.opts.channel.start((data, reply) => this.handleMessage(data, reply))
    console.log(`agent "${this.opts.name}" started`)
  }

  private stringifyToolInput(value: unknown): string {
    try {
      return JSON.stringify(value ?? {})
    } catch {
      return String(value ?? '{}')
    }
  }

  private async handleMessage(
    data: { chatId: string; content: string; senderUnionId: string },
    reply: (content: string, isEnd?: boolean) => void | Promise<void>,
  ): Promise<void> {
    if (!this.agent) return

    const { config, workspace } = this.opts
    const history = await readHistoryMessages(workspace, data.chatId)
    const showThinkingEnabled = config['show-thinking'] ?? false

    const queue: { type: 'thinking' | 'text' | 'tool_start' | 'tool_end'; content?: string }[] = []
    let isStreamEnded = false

    const streamProcess = new Promise<void>(async (res) => {
      try {
        const additionalTools = [
          ...createSubAgentTools(),
          ...createTaskTool(this.opts.channel.type, data.chatId, data.senderUnionId),
        ]

        const stream = this.agent!.streamEvents(
          { messages: [...history, { role: 'user', content: data.content }] },
          { version: 'v2', recursionLimit: config['recursion-limit'] ?? 100 },
        )

        let isThinking = false
        for await (const event of stream) {
          if (event.event === 'on_chat_model_stream') {
            const chunk = event.data?.chunk
            const content = chunk?.content
            if (typeof content === 'string') {
              queue.push({ type: 'text', content })
            } else if (config.type === 'anthropic' && Array.isArray(content)) {
              for (const item of content) {
                if (item.type === 'thinking') {
                  if (!isThinking) {
                    isThinking = true
                    queue.push({ type: 'thinking', content: '\n> [思考中...]\n\n' })
                    if (showThinkingEnabled) queue.push({ type: 'thinking', content: '> ' })
                  }
                  if (showThinkingEnabled) queue.push({ type: 'thinking', content: item.thinking || '' })
                } else if (item.type === 'text') {
                  if (isThinking) {
                    queue.push({ type: 'thinking', content: '\n\n' })
                    isThinking = false
                  }
                  if (typeof item.text === 'string') queue.push({ type: 'text', content: item.text })
                }
              }
            }
          } else if (event.event === 'on_tool_start') {
            queue.push({ type: 'tool_start', content: `\n> [调用工具: ${event.name}]\n` })
            queue.push({ type: 'tool_start', content: `> ${this.stringifyToolInput(event.data?.input ?? event.data ?? {})}\n\n` })
          } else if (event.event === 'on_tool_end') {
            queue.push({ type: 'tool_end', content: `\n> [工具 ${event.name} 返回完毕]\n\n` })
          }
        }
      } catch (err) {
        console.error(err)
        queue.push({ type: 'text', content: '\n[错误]' + (err instanceof Error ? err.message : err) })
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
        await reply(sendMsg)
        const usefulContent = popMessage.filter((item) => item.type === 'text').map((item) => item.content).join('')
        fullContent += usefulContent || ''
      }
    }
    await streamProcess
    await reply('', true)
    if (fullContent) {
      await saveHistoryMessages(workspace, data.chatId, [
        { role: 'user', content: data.content },
        { role: 'assistant', content: fullContent },
      ])
    }
  }
}
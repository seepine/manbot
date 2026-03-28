import { createMiddleware, DynamicStructuredTool } from 'langchain'
import { mkdirSync } from 'node:fs'
import { Channel, type MessageContent, type MessageMeta } from '../channels/channel.ts'
import { createChannel } from '../channels/factory.ts'
import type { ProviderConfig, AgentConfig, AgentProviderConfig } from '../config/types.ts'
import { loadMemoryPrompt, loadPromptTools } from './prompt-loader.ts'
import { createInnerMcpTools } from './tools/mcp.ts'
import { createDownloadTools } from './tools/download.ts'
import { ToolRegistry } from './tool-registry.ts'
import { createSkillsTools, loadSkillPrompt } from './tools/skills.ts'
import { z } from 'zod'
import { join } from 'node:path'
import { readMessages, saveMessages } from './utils/message.ts'
import { logger } from '../log.ts'
import { TaskManager } from './task-manager.ts'
import { EasyAgent } from '../langchain/easy-agent.ts'
import { createSubAgentTools } from './tools/sub-agent.ts'
import { FileMemory, type Memory } from '../langchain/memory.ts'
import { createSystemTools } from './tools/system.ts'
import type { AgentHook } from '../langchain/types.ts'
import { McpManager, type McpToolsResult } from './mcp-manager.ts'

export class Agent {
  private innerMcpTools: McpToolsResult | null = null
  private workspace: string
  private agentDir: string
  private provider: ProviderConfig & AgentProviderConfig
  private channel: Channel
  private heartbeat: NodeJS.Timeout
  private taskManager: TaskManager
  private isStarting = false
  private isRunning = false
  private isStopping = false

  constructor(
    private opts: {
      name: string
      provider: ProviderConfig
      config: AgentConfig
      toAgents: string[]
    },
  ) {
    this.provider = {
      ...opts.provider,
      ...opts.config.provider,
    }
    const workspaceDir = opts.config['workspace-dir'] || `workspace-${this.opts.name}`
    this.workspace = workspaceDir.startsWith('/') ? workspaceDir : join(process.cwd(), workspaceDir)
    this.agentDir = join(process.cwd(), '.manbot', 'agents', opts.name)

    mkdirSync(this.workspace, { recursive: true })
    mkdirSync(this.agentDir, { recursive: true })
    this.channel = createChannel(this.workspace, opts.name, opts.config.channel)
    this.taskManager = new TaskManager(this.agentDir, opts.config.channel)
    this.heartbeat = setInterval(() => this.handleHeartbeat(), 3000)
  }

  async start(): Promise<void> {
    if (this.isStarting) {
      return
    }
    this.innerMcpTools = await createInnerMcpTools(this.workspace)
    await this.channel.start((content, info) => this.receiveMessage(content, info))
    this.taskManager.start(() => this.createAgent())
    this.isStarting = true
    logger.info(`agent "${this.opts.name}" started`)
  }

  async stop(): Promise<void> {
    if (this.isStopping) return
    this.isStopping = true
    clearInterval(this.heartbeat)
    try {
      await this.channel.stop()
      this.taskManager.stop()
      await this.innerMcpTools?.client?.close()
      logger.info(`[agent] "${this.opts.name}" stopped`)
    } catch (e) {
      logger.error(e, '[agent] agent stop error')
    }
  }

  async createAgent(
    opts: {
      additionalTools?: DynamicStructuredTool[]
      additionalSystemPrompt?: string
      additionalHooks?: AgentHook[]
      memory?: Memory
    } = {},
  ): Promise<EasyAgent> {
    const workspace = this.workspace
    const provider = this.provider

    const [prompt, skillPrompt] = await Promise.all([
      loadPromptTools(workspace),
      loadSkillPrompt(workspace),
    ])

    const tools = [
      ...createSystemTools(workspace),
      ...createDownloadTools(workspace),
      ...createSkillsTools(workspace),
      ...((this.innerMcpTools?.tools ?? []) as DynamicStructuredTool[]),
    ]

    const mcpManager = new McpManager(this.agentDir)
    tools.push(...(mcpManager.getManageTools() as DynamicStructuredTool[]))

    const mcpTools = await mcpManager.loadMcpTools()
    if (provider['auto-tool-discovery'] && mcpTools?.tools?.length) {
      const toolRegistry = new ToolRegistry()
      toolRegistry.register(mcpTools.tools)
      tools.push(...toolRegistry.createProxyTools())
    } else {
      tools.push(...((mcpTools?.tools ?? []) as DynamicStructuredTool[]))
    }

    // Add additional tools
    const { additionalTools = [], additionalSystemPrompt = '' } = opts
    tools.push(...additionalTools)
    tools.push(
      ...createSubAgentTools((prompt) => {
        return new EasyAgent({
          provider: this.provider,
          tools: tools,
          systemPrompt: prompt,
        })
      }),
    )

    // Add system prompt
    let systemPrompt = `${prompt}\n\n${skillPrompt}`
    if (additionalSystemPrompt) {
      systemPrompt += '\n\n' + additionalSystemPrompt
    }

    return new EasyAgent({
      provider: this.provider,
      tools: tools,
      systemPrompt: systemPrompt,
      memory: opts.memory,
      hooks: opts.additionalHooks || [],
      middleware: [
        createMiddleware({
          name: 'clear_tools_state_after_agent',
          async afterAgent() {
            try {
              await mcpTools?.client?.close()
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

  private formatMessageContent(item: MessageContent): string {
    if (item.type === 'text') {
      return item.content
    }
    return [
      `${item.type === 'image' ? '附加图片' : '附加文件'}：${item.filePath}`,
      item.error ? `文件保存时出错: ${item.error}` : '',
    ]
      .join('\n\n')
      .trimEnd()
  }

  private messageToUserContent(item: MessageContent): { role: 'user'; content: string } {
    if (item.type === 'text') {
      return { role: 'user', content: item.content }
    }
    return { role: 'user', content: this.formatMessageContent(item) }
  }

  private async receiveMessage(content: Array<MessageContent>, meta: MessageMeta) {
    logger.info({ meta, content }, '[agent] 收到消息')
    await saveMessages(this.agentDir, meta, content)
  }

  private async handleHeartbeat(): Promise<void> {
    if (!this.isStarting || this.isRunning) {
      return
    }
    this.isRunning = true
    const meta = await readMessages(this.agentDir)
    if (!meta) {
      this.isRunning = false
      return
    }
    if (meta.messages.length <= 0) {
      this.isRunning = false
      return
    }
    const allContent = meta.messages
    const provider = this.provider
    const showThinkingEnabled = provider['show-thinking-message'] ?? false
    const showToolEnabled = provider['show-tool-message'] ?? false

    const queue: { type: 'thinking' | 'text' | 'tool_start' | 'tool_end'; content?: string }[] = []
    let isStreamEnded = false

    const streamProcess = new Promise<void>(async (res) => {
      try {
        const additionalTools = [
          ...this.taskManager.createTools(
            this.channel.type as 'feishu',
            meta.chatId,
            meta.senderId,
          ),
          new DynamicStructuredTool({
            name: 'history-tool__get_history_messages',
            description:
              '获取对话的历史消息列表。用于让agent了解之前的对话内容，避免重复问答或上下文不连贯。返回格式为文本，包含历史消息的内容和类型。',
            schema: z.object({
              count: z.number().max(50).describe('需要获取的历史消息数量，默认为10').optional(),
            }),
            func: async ({ count = 10 }) => {
              const memory = new FileMemory(meta.chatId, this.agentDir, 'normal')
              const messages = await memory.read()
              const result = messages.slice(-count).join('\n\n')
              return result
            },
          }),
          new DynamicStructuredTool({
            name: 'agent-team__get-can-send-message-agents',
            description:
              '获取所有可接收消息的 agent 列表。用于查看你有权向哪些 agent 联系或指派任务。',
            schema: z.object({}),
            func: async () => {
              return 'to-agents:\n' + this.opts.toAgents.map((item) => `-${item}`).join('\n')
            },
          }),
          new DynamicStructuredTool({
            name: 'agent-team__send-message',
            description:
              '向指定 agent 发送消息或指派任务。用于多 agent 协作场景，如委托任务、请求信息、通知进展。',
            schema: z.object({
              agentName: z.string().describe('agent name'),
              message: z.string().describe('send message to agent'),
            }),
            func: async (args) => {
              if (!meta.isGroup) {
                return `发送消息失败，请确保当前处于群聊中，并且对方也在群中`
              }
              if (!this.opts.toAgents.includes(args.agentName)) {
                return `发送消息失败，找不到名为 ${args.agentName} 的 agent`
              }
              const otherAgentDir = join(process.cwd(), '.manbot', 'agents', args.agentName)
              await saveMessages(otherAgentDir, meta, [
                { type: 'text', content: `${args.message}` },
              ])
              return `发送消息给 ${args.agentName} 成功`
            },
          }),
          new DynamicStructuredTool({
            name: 'systemtool__send_file_to_user',
            description: `将文件或图片发送给用户。**仅在用户明确要求"发给我/发送给我/把这个文件发给我"时使用**。不适用于：用户只是上传了文件、讨论文件内容、或没有明确发送请求的场景。`,
            schema: z.object({
              fileType: z.enum(['image', 'file']).describe('文件类型'),
              filePath: z.string().describe('文件完整路径，例如 /root/workspace/a.txt'),
            }),
            func: async (args) => {
              try {
                if (!(await Bun.file(args.filePath).exists())) {
                  return `Send file fail: 文件不存在，请确保文件是完整路径，而不是相对路径或只有一个文件名称`
                }
                const chat = await this.channel.createChat(meta.chatId)
                await chat.send({
                  type: args.fileType,
                  filePath: args.filePath,
                })
                await chat.close()
                return `Send file success.`
              } catch (e: any) {
                logger.error({ error: e }, '[agent] 文件发送失败')
                return `Send file fail: ${e.message || e}`
              }
            },
          }),
        ]
        const self = this
        const agent = await this.createAgent({
          additionalTools,
          additionalHooks: [
            {
              onInvokeAfter(inputMessages, outputMessage) {
                new Promise<void>(async (res) => {
                  const agent = new EasyAgent({
                    provider: self.provider,
                    tools: [
                      ...(self.innerMcpTools?.tools || []),
                      ...createSystemTools(self.workspace),
                    ],
                    systemPrompt: await loadMemoryPrompt(self.workspace),
                  })
                  await agent.invokeSync(
                    `你需要整理的内容是：\n\n## 用户输入：\n\`\`\`\n${JSON.stringify(inputMessages)}\n\`\`\`\n\n\n## 你的回答：\n\`\`\`\n${outputMessage}\n\`\`\``,
                  )
                  res()
                }).then()
                return outputMessage
              },
            },
          ],
          memory: new FileMemory(meta.chatId, this.agentDir, 'slim'),
        })

        let isThinking = false
        const inputMessages = []
        for (const item of allContent.map((item) => this.messageToUserContent(item))) {
          inputMessages.push(item)
          inputMessages.push({
            role: 'assistant' as const,
            content: '已跳过（"Skipped due to queued user message."）',
          })
        }
        inputMessages.pop()

        for await (const chunk of agent.invoke(inputMessages)) {
          if (chunk.type === 'text') {
            if (isThinking) {
              queue.push({ type: 'thinking', content: '\n\n' })
              isThinking = false
            }
            queue.push({ type: 'text', content: chunk.content })
          } else if (chunk.type === 'thinking') {
            if (!isThinking) {
              isThinking = true
              queue.push({ type: 'thinking', content: '\n> [思考中...]\n\n' })
              queue.push({ type: 'thinking', content: '> ' })
            }
            queue.push({ type: 'thinking', content: chunk.content })
          } else if (chunk.type === 'tool_start') {
            queue.push({ type: 'tool_start', content: `\n> [调用工具: ${chunk.name}]\n` })
            queue.push({
              type: 'tool_start',
              content: `> ${this.stringifyToolInput(chunk.arguments)}\n\n`,
            })
          } else if (chunk.type === 'tool_end') {
            queue.push({ type: 'tool_end', content: `\n> [工具 ${chunk.name} 返回完毕]\n\n` })
          }
        }
      } catch (err) {
        logger.error(err, '[agent] agent.invoke 出错')
        queue.push({
          type: 'text',
          content: '\n[错误]' + (err instanceof Error ? err.message : err),
        })
      } finally {
        isStreamEnded = true
        res()
      }
    }).then()

    const userMessage = (
      allContent.map((item) => this.formatMessageContent(item)).pop() || ''
    ).trim()

    let waitCount = 1
    const chat = await this.channel.createChat(meta.chatId, userMessage)
    while (!isStreamEnded || queue.length > 0) {
      if (queue.length === 0) {
        await Bun.sleep(waitCount * 50)
        waitCount = Math.min(waitCount + 1, 20)
        continue
      }
      waitCount = 1
      const popMessage = queue.splice(0, queue.length)
      if (popMessage.length > 0) {
        const sendMsg = popMessage
          .filter((item) => {
            if (item.type === 'text') {
              return true
            }
            if (item.type === 'thinking') {
              return showThinkingEnabled
            }
            if (item.type === 'tool_start' || item.type === 'tool_end') {
              return showToolEnabled
            }
            return false
          })
          .map((item) => item.content)
          .join('')
        await chat.send({ type: 'text', content: sendMsg })
      }
    }
    try {
      await streamProcess
      await chat.close()
    } catch (e) {
      logger.error({ err: e }, '[agent] process and save history')
    } finally {
      saveMessages(this.agentDir, meta, [], allContent.length)
      this.isRunning = false
    }
  }
}

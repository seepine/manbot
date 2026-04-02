import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAICompletions } from '@langchain/openai'
import type { AgentProviderConfig, ProviderConfig } from '../config/types'
import { createAgent, SystemMessage, type AgentMiddleware } from 'langchain'
import { isArray, isEmpty, isString } from 'lodash-es'
import type { ClientTool, ServerTool } from '@langchain/core/tools'
import type { Memory } from './memory'
import type {
  AgentHook,
  CreateAgentOpts,
  CreateAgentOptsWithTrue,
  Message,
  MessageChunk,
  Messages,
} from './types'

export type Provider = Omit<ProviderConfig & AgentProviderConfig, 'name'>
export class EasyAgent {
  private provider: Provider
  private memory?: Memory
  private maxHistoryMessages: number
  private hooks: AgentHook[]

  constructor(
    protected opts: {
      provider: Provider
      tools?: (ClientTool | ServerTool)[]
      systemPrompt?: string | string[]
      middleware?: AgentMiddleware[]
      memory?: Memory
      maxHistoryMessages?: number
      hooks?: AgentHook[]
    },
  ) {
    this.provider = opts.provider
    this.memory = opts.memory
    this.maxHistoryMessages = opts.maxHistoryMessages || 200
    this.hooks = opts.hooks || []
  }

  getProvider() {
    return this.provider
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

  private async *streamingInvoke(
    messages: Messages,
    additionalOpts?: CreateAgentOpts,
  ): AsyncGenerator<MessageChunk> {
    const provider = this.provider
    const opts = this.opts

    let agentOpts: CreateAgentOptsWithTrue = {
      systemPrompt: [],
      tools: opts.tools,
      middleware: opts.middleware,
    }

    if (opts.systemPrompt !== undefined) {
      agentOpts.systemPrompt?.push(
        ...(isArray(opts.systemPrompt) ? opts.systemPrompt : [opts.systemPrompt]),
      )
    }
    if (additionalOpts?.systemPrompt !== undefined) {
      agentOpts.systemPrompt?.push(
        ...(isArray(additionalOpts?.systemPrompt)
          ? additionalOpts.systemPrompt
          : [additionalOpts.systemPrompt]),
      )
    }
    if (additionalOpts?.tools !== undefined) {
      agentOpts.tools = [...(agentOpts.tools || []), ...additionalOpts.tools]
    }
    if (additionalOpts?.middleware !== undefined) {
      agentOpts.middleware = [...(agentOpts.middleware || []), ...additionalOpts.middleware]
    }

    for (const hook of this.hooks) {
      if (hook.onCreateAgentBefore !== undefined) {
        agentOpts = await hook.onCreateAgentBefore(agentOpts)
      }
    }

    const systemPrompt = agentOpts.systemPrompt?.filter((item) => !isEmpty(item.trim())) || []
    const agent = createAgent({
      ...agentOpts,
      model: this.createModel(),
      systemPrompt:
        systemPrompt.length > 0
          ? new SystemMessage({
              content: systemPrompt.map((item) => {
                return {
                  type: 'text',
                  text: item,
                }
              }),
            })
          : undefined,
    })
    const stream = agent.streamEvents(
      { messages: messages },
      { version: 'v2', recursionLimit: provider['recursion-limit'] ?? 100 },
    )

    for await (const event of stream) {
      if (event.event === 'on_chat_model_stream') {
        const chunk = event.data?.chunk
        const content = chunk?.content
        if (typeof content === 'string') {
          yield {
            type: 'text',
            content,
          }
        } else if (provider.type === 'anthropic' && Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'thinking') {
              yield {
                type: 'thinking',
                content: item.thinking || '',
              }
            } else if (item.type === 'text') {
              if (typeof item.text === 'string') {
                yield {
                  type: 'text',
                  content: item.text,
                }
              }
            }
          }
        }
      } else if (event.event === 'on_tool_start') {
        yield {
          type: 'tool_start',
          name: event.name,
          arguments: event.data?.input ?? event.data ?? {},
        }
      } else if (event.event === 'on_tool_end') {
        yield {
          type: 'tool_end',
          name: event.name,
        }
      }
    }
  }

  /**
   * 流式对话
   * @param messages 
   * @code
   *   ```
   *    for await (const chunk of agent.invoke('今天几号')) {
          if (chunk.type === 'text') {
            process.stdout.write(chunk.content)
          }
        }
   *   ```
   */
  async *invoke(
    messages: Messages | Message | string,
    additionalOpts?: CreateAgentOpts,
  ): AsyncGenerator<MessageChunk> {
    const inputMessages = (isArray(messages) ? messages : [messages]).map((item) => {
      if (isString(item)) {
        return {
          role: 'user' as const,
          content: item,
        }
      }
      return item as Message
    })

    const historyMessages = (await this.memory?.read()) || []

    let realMessages = [...historyMessages, ...inputMessages]

    // hook
    for (const hook of this.hooks) {
      if (hook.onInvokeBefore !== undefined) {
        realMessages = await hook.onInvokeBefore(realMessages)
      }
    }

    let fullContent = ''
    for await (const chunk of this.streamingInvoke(realMessages, additionalOpts)) {
      if (chunk.type === 'text') {
        fullContent += chunk.content
      }
      let newChunk = chunk
      for (const hook of this.hooks) {
        if (hook.onInvokeChunkBefore !== undefined) {
          newChunk = await hook.onInvokeChunkBefore(newChunk)
        }
      }
      yield newChunk
    }

    // hook
    for (const hook of this.hooks) {
      if (hook.onInvokeAfter !== undefined) {
        fullContent = await hook.onInvokeAfter(inputMessages, fullContent, historyMessages)
      }
    }

    if (!this.memory) {
      return
    }

    if (realMessages.length > this.maxHistoryMessages) {
      realMessages.splice(0, realMessages.length - this.maxHistoryMessages)
    }

    await this.memory.save([
      // 输入
      ...realMessages,
      // 返回
      { role: 'assistant', content: fullContent },
    ])
  }

  /**
   * 同步对话
   *
   * @param messages 输入消息
   * @returns 结果 {content 文本内容, tools 调用的工具集 }
   * @code
   *  ```
   *  const {content, tools} = await invokeSync('今天天气如何')
   *  ```
   */
  async invokeSync(messages: Messages | Message | string, additionalOpts?: CreateAgentOpts) {
    let content = ''
    let thinking = ''
    const tools = []
    for await (const chunk of this.invoke(messages, additionalOpts)) {
      if (chunk.type === 'text') {
        content += chunk.content
      } else if (chunk.type === 'thinking') {
        thinking += chunk.content
      } else if (chunk.type === 'tool_start') {
        tools.push({
          name: chunk.name,
          arguments: chunk.arguments,
        })
      }
    }
    return {
      content,
      tools,
    }
  }
}

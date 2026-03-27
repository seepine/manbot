import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAICompletions } from '@langchain/openai'
import type { AgentProviderConfig, ProviderConfig } from '../config/types'
import { createAgent, ReactAgent, type AgentMiddleware } from 'langchain'
import { isArray, isString } from 'lodash-es'
import type { ClientTool, ServerTool } from '@langchain/core/tools'
import type { Memory } from './memory'
import type { Message, MessageChunk, Messages } from './types'

export type Provider = Omit<ProviderConfig & AgentProviderConfig, 'name'>
export class EasyAgent {
  private provider: Provider

  private agent: ReactAgent
  private memory?: Memory

  constructor(opts: {
    provider: Provider
    tools?: (ClientTool | ServerTool)[]
    systemPrompt?: string | []
    middleware?: AgentMiddleware[]
    memory?: Memory
  }) {
    this.provider = opts.provider
    this.memory = opts.memory
    this.agent = createAgent({
      model: this.createModel(),
      systemPrompt: isArray(opts.systemPrompt) ? opts.systemPrompt.join('\n\n') : opts.systemPrompt,
      tools: opts.tools,
      middleware: opts.middleware,
    })
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
  async *invoke(messages: Messages | Message | string): AsyncGenerator<MessageChunk> {
    const inputMessages = (isArray(messages) ? messages : [messages]).map((item) => {
      if (isString(item)) {
        return {
          role: 'user' as const,
          content: item,
        }
      }
      return item as Message
    })

    const provider = this.provider
    const historyMessages = (await this.memory?.read()) || []

    const stream = this.agent.streamEvents(
      { messages: [...historyMessages, ...inputMessages] },
      { version: 'v2', recursionLimit: provider['recursion-limit'] ?? 100 },
    )

    let fullContent = ''
    for await (const event of stream) {
      if (event.event === 'on_chat_model_stream') {
        const chunk = event.data?.chunk
        const content = chunk?.content
        if (typeof content === 'string') {
          fullContent += content
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
                fullContent += item.text
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
    if (!this.memory) {
      return
    }
    await this.memory.save([
      ...historyMessages,
      // 输入
      ...inputMessages,
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
  async invokeSync(messages: Messages | Message | string) {
    let content = ''
    let thinking = ''
    const tools = []
    for await (const chunk of this.invoke(messages)) {
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

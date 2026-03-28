import type { ClientTool, ServerTool } from '@langchain/core/tools'
import type { AgentMiddleware } from 'langchain'

export type Message = {
  role: 'user' | 'assistant'
  content: string
}
export type Messages = Message[]

export type MessageChunk =
  | {
      type: 'text' | 'thinking'
      content: string
    }
  | {
      type: 'tool_start'
      name: string
      arguments: any
    }
  | {
      type: 'tool_end'
      name: string
    }

export type CreateAgentOpts = {
  systemPrompt?: string
  tools?: (ClientTool | ServerTool)[]
  middleware?: AgentMiddleware[]
}

/**
 * AgentHook 定义了在代理生命周期的不同阶段可以执行的钩子函数。这些钩子函数允许开发者在代理创建前、调用前、调用块前和调用后插入自定义逻辑，以修改代理选项、输入消息、块内容和输出消息等。
 * 通过实现这些钩子函数，开发者可以灵活地定制代理的行为和输出，满足不同的业务需求。
 */
export type AgentHook = {
  /**
   * 在创建代理之前执行，可以用于修改代理选项。
   * @param opts 代理选项，包括系统提示、工具和中间件等。
   * @returns 修改后的代理选项。
   */
  onCreateAgentBefore?: (opts: CreateAgentOpts) => Promise<CreateAgentOpts> | CreateAgentOpts

  /**
   * 在调用代理之前执行，可以用于修改输入消息、添加上下文等。
   * @param messages 输入消息列表，包含用户和助手的消息。
   * @returns 处理后的消息列表，将作为代理的输入。
   */
  onInvokeBefore?: (messages: Messages) => Promise<Messages> | Messages

  /**
   * 在调用代理的块之前执行，可以用于修改块内容。
   * @param chunk 代理块
   * @returns 修改后的代理块。
   */
  onInvokeChunkBefore?: (chunk: MessageChunk) => Promise<MessageChunk> | MessageChunk

  /**
   * 在调用代理之后执行，可以用于处理输出消息。
   * @param inputMessages 输入消息列表。
   * @param outputMessage llm输出消息字符串。
   * @param historyMessages 历史消息列表，包含输入消息之前的对话历史，可能为 empty。
   * @returns 处理后的llm输出消息字符串。
   */
  onInvokeAfter?: (
    inputMessages: Messages,
    outputMessage: string,
    historyMessages: Messages,
  ) => Promise<string> | string
}

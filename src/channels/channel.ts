import type { ChannelConfig } from '../config/types.ts'
import { FeishuChannel } from './feishu.ts'

export type MessageContent = string
export interface MessageHandler {
  (
    content: Array<MessageContent>,
    info: {
      chatId: string
      groupId?: string
      senderId: string
    },
    reply: (content: Array<MessageContent>, isEnd?: boolean) => void | Promise<void>,
  ): void | Promise<void>
}

export abstract class Channel {
  constructor(protected config: ChannelConfig) {}
  abstract readonly type: string
  abstract start(handler: MessageHandler): Promise<void>
  abstract sendMessage(
    chatId: string,
    content: Array<MessageContent>,
    atUserUnionId?: string,
  ): Promise<void>
}

export function createChannel(config: ChannelConfig): Channel {
  if (config.type === 'feishu') {
    return new FeishuChannel(config)
  }
  throw new Error(`Unsupported channel type: ${config.type}`)
}

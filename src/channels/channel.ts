import type { ChannelConfig } from '../config/types.ts'
import { FeishuChannel } from './feishu.ts'

export interface MessageHandler {
  (data: {
    chatId: string
    content: string
    senderUnionId: string
  }, reply: (content: string, isEnd?: boolean) => void | Promise<void>): void | Promise<void>
}

export abstract class Channel {
  constructor(protected config: ChannelConfig) {}

  abstract readonly type: string
  abstract start(handler: MessageHandler): Promise<void>
  abstract sendMessage(chatId: string, content: string, atUserUnionId?: string): Promise<void>
}

export function createChannel(config: ChannelConfig): Channel {
  if (config.type === 'feishu') {
    return new FeishuChannel(config)
  }
  throw new Error(`Unsupported channel type: ${config.type}`)
}
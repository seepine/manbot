import type { ChannelConfig } from '../config/types.ts'

export type MessageContent =
  | {
      type: 'text'
      content: string
    }
  | {
      type: 'image' | 'file'
      filePath: string
      error?: string
    }

export type MessageMeta = {
  chatId: string
  senderId: string
  messageId: string
  isGroup: boolean
}

export interface MessageHandler {
  (content: Array<MessageContent>, meta: MessageMeta): void | Promise<void>
}

export abstract class Channel {
  constructor(
    protected fileDir: string,
    protected config: ChannelConfig,
  ) {}
  abstract readonly type: string
  abstract start(handler: MessageHandler): Promise<void>
  abstract stop(): Promise<void>
  abstract createChat(
    chatId: string,
    question?: string,
  ): Promise<{
    send: (message: MessageContent) => Promise<void>
    close: () => Promise<void>
  }>
}

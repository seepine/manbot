import * as Lark from '@larksuiteoapi/node-sdk'
import { Channel } from './channel.ts'
import type { MessageHandler, MessageContent } from './channel.ts'
import type { FeishuChannelConfig } from '../config/types.ts'

/**
 * Send a message to a Feishu chat without needing a channel instance.
 * This is useful for background tasks that need to send results.
 */
export async function sendFeishuMessage(
  appId: string,
  appSecret: string,
  chatId: string,
  content: string,
  atUserUnionId?: string,
): Promise<void> {
  const client = new Lark.Client({ appId, appSecret })
  await client.im.v1.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: chatId,
      content: JSON.stringify({
        zh_cn: {
          content: [
            [
              {
                tag: 'md',
                text: atUserUnionId ? `<at user_id="${atUserUnionId}"></at>\n${content}` : content,
              },
            ],
          ],
        },
      }),
      msg_type: 'post',
    },
  })
}

type FeishuMessageData = {
  event_id?: string
  token?: string
  create_time?: string
  event_type?: string
  tenant_key?: string
  ts?: string
  uuid?: string
  type?: string
  app_id?: string
  sender: {
    sender_id?: {
      union_id?: string
      user_id?: string
      open_id?: string
    }
    sender_type: string
    tenant_key?: string
  }
  message: {
    message_id: string
    root_id?: string
    parent_id?: string
    create_time: string
    update_time?: string
    chat_id: string
    thread_id?: string
    chat_type: string
    message_type: string
    content: string
    mentions?: Array<{
      key: string
      id: {
        union_id?: string
        user_id?: string
        open_id?: string
      }
      name: string
      tenant_key?: string
    }>
    user_agent?: string
  }
}

export class FeishuChannel extends Channel {
  readonly type = 'feishu'

  private client: Lark.Client

  constructor(config: FeishuChannelConfig) {
    super(config)
    this.client = new Lark.Client({ appId: config['app-id'], appSecret: config['app-secret'] })
  }

  async start(handler: MessageHandler): Promise<void> {
    const wsClient = new Lark.WSClient({
      appId: this.config['app-id'],
      appSecret: this.config['app-secret'],
    })
    const eventDispatcher = new Lark.EventDispatcher({}).register({
      'im.message.receive_v1': (data) => this.handleMessage(data as FeishuMessageData, handler),
    })
    await wsClient.start({ eventDispatcher })
  }

  async sendMessage(
    chatId: string,
    content: Array<MessageContent>,
    atUserUnionId?: string,
  ): Promise<void> {
    const text = content.join('\n')
    await this.client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        content: JSON.stringify({
          zh_cn: {
            content: [
              [
                {
                  tag: 'md',
                  text: atUserUnionId ? `<at user_id="${atUserUnionId}"></at>\n${text}` : text,
                },
              ],
            ],
          },
        }),
        msg_type: 'post',
      },
    })
  }

  private defaultCard({ title, content }: { title?: string; content: string }) {
    return JSON.stringify({
      config: { wide_screen_mode: true },
      elements: [{ tag: 'markdown', content }],
      header: title ? { title: { content: title, tag: 'plain_text' } } : undefined,
    })
  }

  private createCard({ userMessage, atUserName }: { userMessage: string; atUserName?: string }) {
    const summary = `回复${atUserName ? ` @${atUserName}` : ''}: ${userMessage}`.trim()
    return {
      type: 'card_json',
      data: JSON.stringify({
        schema: '2.0',
        config: {
          streaming_mode: true,
          summary: { content: summary },
          streaming_config: {
            print_frequency_ms: { default: 40, android: 40, ios: 40, pc: 40 },
            print_step: { default: 1, android: 1, ios: 1, pc: 1 },
            print_strategy: 'fast',
          },
        },
        body: {
          elements: [
            { tag: 'markdown', content: `> ${summary}`, element_id: 'markdown_0' },
            { tag: 'markdown', content: '', element_id: 'markdown_1' },
            { tag: 'markdown', content: '[生成中...]', element_id: 'tips' },
          ],
        },
      }),
    }
  }

  private async genCardMessage(
    chatId: string,
    question: string,
    senderUnionId?: string,
  ): Promise<string | undefined> {
    try {
      const { data } = await this.client.cardkit.v1.card.create({
        data: this.createCard({ userMessage: question }),
      })
      const cardId = data?.card_id!

      await this.client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          content: JSON.stringify({ type: 'card', data: { card_id: cardId } }),
          msg_type: 'interactive',
        },
      })
      return cardId
    } catch (e: any) {
      let err = `创建卡片失败: ${e.data?.code} ${e.data?.message}\n请检查应用是否开启权限: [cardkit:card:write]，点击链接申请并开通任一权限即可：https://open.feishu.cn/app/cli_a928d1a1eb78dbd2/auth?q=cardkit:card:write&op_from=openapi&token_type=tenant`
      if (e.name === 'AxiosError') {
        err = e.response.data.msg
      }

      await this.client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          content: this.defaultCard({ content: err }),
          msg_type: 'interactive',
        },
      })
    }
  }

  private async handleMessage(data: FeishuMessageData, handler: MessageHandler): Promise<void> {
    const { chat_id, content, chat_type, mentions } = data.message

    if (chat_type === 'group') {
      if (!mentions?.length) return
      const mentionName = mentions[0]?.name || ''
      if (
        mentionName.toLowerCase() !== (this.config['app-name'] || 'manbot').toLowerCase()
      ) {
        return
      }
    }

    const contentRes: { text: string } = JSON.parse(content)
    const question = contentRes.text.replace('@_user_1', '').trim()
    const senderUnionId = data.sender.sender_id?.union_id

    let cardId: string | undefined
    let sequence = 0
    let allReplyContent = ''

    await handler(
      [question],
      { chatId: chat_id, senderId: senderUnionId || '' },
      async (replyContent, isEnd = false) => {
        if (!cardId) {
          cardId = await this.genCardMessage(chat_id, question, senderUnionId)
          if (!cardId) return
        }

        try {
          if (replyContent) {
            allReplyContent += replyContent.join('')
            await this.client.cardkit.v1.cardElement.content({
              path: { card_id: cardId, element_id: 'markdown_1' },
              data: { content: allReplyContent, sequence: sequence++ },
            })
          }
          if (isEnd) {
            await this.client.cardkit.v1.cardElement.delete({
              path: { card_id: cardId, element_id: 'tips' },
              data: { sequence: sequence++ },
            })
            cardId = undefined
          }
        } catch (e) {
          console.error(e)
        }
      },
    )
  }
}
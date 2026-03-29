import * as Lark from '@larksuiteoapi/node-sdk'
import { Channel } from './channel.ts'
import type { MessageHandler, MessageContent } from './channel.ts'
import type { FeishuChannelConfig } from '../config/types.ts'
import { isArray } from 'lodash-es'
import { join, basename } from 'node:path'
import { mkdirSync } from 'node:fs'
import { logger } from '../log.ts'
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

type ContentText = {
  text: string
}
type ContentImage = {
  image_key: string
}
type ContentFile = {
  file_key: string
  file_name: string
}
type ContentPost = {
  title: string
  content: (
    | {
        tag: 'img'
        image_key: string
      }
    | {
        tag: 'text'
        text: string
      }
    | {
        tag: 'a'
        href: string
        text: string
      }
    | {
        tag: 'media'
        file_key: string
        image_key: string
      }
    | { tag: 'hr' }
    | {
        tag: 'code_block'
        language: string
        text: string
      }
  )[][]
}
type Content =
  | ContentText
  | ContentImage
  | ContentFile
  | ContentPost
  | Array<ContentText | ContentImage | ContentFile | ContentPost>

export class FeishuChannel extends Channel {
  readonly type = 'feishu'

  private client: Lark.Client
  private wsClient: Lark.WSClient | undefined

  constructor(fileDir: string, config: FeishuChannelConfig) {
    super(fileDir, config)
    this.client = new Lark.Client({ appId: config['app-id'], appSecret: config['app-secret'] })
  }

  async start(handler: MessageHandler): Promise<void> {
    this.wsClient = new Lark.WSClient({
      appId: this.config['app-id'],
      appSecret: this.config['app-secret'],
    })
    const eventDispatcher = new Lark.EventDispatcher({}).register({
      'im.message.receive_v1': (data) => this.handleMessage(data as FeishuMessageData, handler),
    })
    await this.wsClient.start({ eventDispatcher })
  }

  async stop() {
    this.wsClient?.close()
  }

  private defaultCard({ title, content }: { title?: string; content: string }) {
    return JSON.stringify({
      config: { wide_screen_mode: true },
      elements: [{ tag: 'markdown', content }],
      header: title ? { title: { content: title, tag: 'plain_text' } } : undefined,
    })
  }

  private createCard({ userMessage, atUserName }: { userMessage?: string; atUserName?: string }) {
    let summary = ''
    if (userMessage) {
      summary = `回复${atUserName ? ` @${atUserName}` : ''}: ${userMessage}`
        .replaceAll('\n', ' ')
        .trim()
    }
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
            { tag: 'markdown', content: summary ? `> ${summary}\n` : '', element_id: 'markdown_0' },
            { tag: 'markdown', content: '', element_id: 'markdown_1' },
            { tag: 'markdown', content: '[生成中...]', element_id: 'tips' },
          ],
        },
      }),
    }
  }

  private async genCardMessage(
    chatId: string,
    question?: string,
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

  private async uploadFile(filetype: 'image' | 'file', filepath: string) {
    const file = Bun.file(filepath)
    if (!(await file.exists())) {
      throw Error(`文件不存在`)
    }
    try {
      if (filetype === 'file') {
        const resp = await this.client.im.v1.file.create({
          data: {
            file_type: 'stream',
            file_name: basename(filepath),
            file: Buffer.from(await file.arrayBuffer()),
          },
        })
        if (resp && resp.file_key) {
          return resp.file_key
        }
      } else if (filetype === 'image') {
        const resp = await this.client.im.v1.image.create({
          data: {
            image_type: 'message',
            image: Buffer.from(await file.arrayBuffer()),
          },
        })
        if (resp && resp.image_key) {
          return resp.image_key
        }
      }
      throw Error('上传文件失败')
    } catch (e: any) {
      throw Error(JSON.stringify(e?.response?.data || e?.response || e, null, 2))
    }
  }

  private async parseContent(
    item: ContentText | ContentImage | ContentFile | ContentPost,
    messageId: string,
  ): Promise<MessageContent[]> {
    if ('text' in item && item.text?.length > 0) {
      return [
        {
          type: 'text',
          content: item.text,
        },
      ]
    }
    if ('title' in item) {
      const postArr = (item.content || []).flat()
      let res: MessageContent[] = []
      let text = ''
      for (const post of postArr) {
        if (post.tag === 'text') {
          text += post.text + '\n'
        } else if (post.tag === 'a') {
          text += `[${post.text}](${post.href})`
        } else if (post.tag === 'hr') {
          text += `\n\n`
        } else if (post.tag === 'code_block') {
          text += `\n\n\`\`\`${post.language}\n${post.text}\n\`\`\``
        } else if (post.tag === 'img') {
          res.push(...(await this.parseContent({ image_key: post.image_key }, messageId)))
        } else if (post.tag === 'media') {
          res.push(
            ...(await this.parseContent(
              { file_key: post.file_key, file_name: `${post.file_key}.mp4` },
              messageId,
            )),
          )
        } else {
          logger.warn(post as any, '[feishu] 暂不支持解析该消息标签')
        }
      }
      res.push({
        type: 'text',
        content: text,
      })
      return res
    }
    let filePath
    let fileType: 'image' | 'file'
    let fileKey
    if ('image_key' in item) {
      fileType = 'image'
      fileKey = item.image_key
      filePath = join(this.fileDir, `${item.image_key}.png`)
    } else if ('file_key' in item) {
      fileType = 'file'
      fileKey = item.file_key
      filePath = join(this.fileDir, `${item.file_key}_${item.file_name}`)
    } else {
      logger.warn(item, '[feishu] 暂不支持解析该消息类型')
      return [
        {
          type: 'text',
          content: `[feishu] 用户发送了无法解析的消息\n\`\`\`json\n${JSON.stringify(item)}\n\`\`\``,
        },
      ]
    }
    try {
      mkdirSync(this.fileDir, { recursive: true })
      const res = await this.client.im.v1.messageResource.get({
        path: {
          message_id: messageId,
          file_key: fileKey,
        },
        params: {
          type: fileType,
        },
      })
      await res.writeFile(filePath)
      return [
        {
          type: fileType,
          filePath: filePath,
        },
      ]
    } catch (e) {
      const error = JSON.stringify((e as { response?: { data?: unknown } }).response?.data, null, 2)
      logger.error({ error: e }, '[feishu] 文件发送失败')
      return [
        {
          type: fileType,
          filePath: filePath,
          error: error,
        },
      ]
    }
  }

  private async handleMessage(data: FeishuMessageData, handler: MessageHandler): Promise<void> {
    const { chat_id, chat_type, mentions } = data.message
    let { content } = data.message
    logger.info({ message: data.message, sender: data.sender }, '[feishu] handle message')
    if (chat_type === 'group') {
      let isCallMe = false
      let hasMention = (mentions || []).length > 0
      // 优先判断@提及，如果有@提及但没有明确@我，则不答复
      if (hasMention) {
        let myMentionInfo:
          | {
              name: string // manbot
              key: string // @_user_1
            }
          | undefined
        for (const mention of mentions || []) {
          const mentionName = mention.name || ''
          if (mentionName.toLowerCase() === (this.config['app-name'] || 'manbot').toLowerCase()) {
            myMentionInfo = mention
            break
          }
        }
        if (myMentionInfo) {
          content = content.replaceAll(myMentionInfo.key, `@${myMentionInfo.name}`)
          isCallMe = true
        }
      }
      // 如果无@提及
      if (!hasMention) {
        // 消息内容包含@应用名称，也视为@了我
        if (content.includes(`@${this.config['app-name'] || 'manbot'}`)) {
          isCallMe = true
        }
        // 如果配置了无需@也要答复的群聊列表，且当前群聊在列表中，也视为@了我
        else if ((this.config['reply-without-mention-groups'] || []).includes(chat_id)) {
          isCallMe = true
        }
      }

      if (!isCallMe) {
        return
      }
    }

    const parsed: Content = JSON.parse(content)
    const contentItems = (isArray(parsed) ? parsed : [parsed]).map<Promise<MessageContent[]>>(
      async (item) => {
        return this.parseContent(item, data.message.message_id)
      },
    )

    const messages = (await Promise.all(contentItems)).flat().filter((item) => {
      if (item.type === 'text') {
        return item.content.length > 0
      }
      return true
    })

    const senderUnionId = data.sender.sender_id?.union_id
    await handler(messages, {
      chatId: chat_id,
      senderId: senderUnionId || '',
      isGroup: chat_type === 'group',
      messageId: data.message.message_id,
    })
  }

  async createChat(chatId: string, question?: string) {
    let cardId: string | undefined
    // 必须从1开始
    let sequence = 1
    let allReplyContent = ''

    const send = async (message: MessageContent) => {
      try {
        logger.info(message, '[feishu] send message')
        // 处理文件发送
        if (message.type !== 'text') {
          const fileKey = await this.uploadFile(message.type, message.filePath)
          await this.client.im.v1.message.create({
            params: {
              receive_id_type: 'chat_id',
            },
            data: {
              receive_id: chatId,
              msg_type: message.type,
              content: JSON.stringify(
                message.type === 'image'
                  ? {
                      image_key: fileKey,
                    }
                  : {
                      file_key: fileKey,
                    },
              ),
              uuid: fileKey,
            },
          })
          return
        }

        if (!cardId && message.type === 'text') {
          cardId = await this.genCardMessage(chatId, question)
        }
        if (!cardId) {
          return
        }
        allReplyContent += message.content || '\n'
        const updateResp = await this.client.cardkit.v1.cardElement.content({
          path: { card_id: cardId, element_id: 'markdown_1' },
          data: { content: allReplyContent, sequence: sequence++ },
        })
        if (updateResp.code !== 0) {
          logger.error({ response: updateResp }, '[feishu] 卡片内容发送失败')
        }
      } catch (e) {
        logger.error(e, '[feishu] 发送消息失败')
      }
    }

    const close = async () => {
      if (!cardId) {
        return
      }
      await this.client.cardkit.v1.cardElement.delete({
        path: { card_id: cardId, element_id: 'tips' },
        data: { sequence: sequence++ },
      })
      cardId = undefined
      allReplyContent = ''
      sequence = 1
    }

    return {
      send,
      close,
    }
  }
}

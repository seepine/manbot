import * as Lark from '@larksuiteoapi/node-sdk'

type FeishuConfig = {
  appId: string
  appSecret: string
  encryptKey?: string
  verificationToken?: string
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

export type Callback = (
  data: FeishuMessageData,
  reply: (replyContent: string, isEnd?: boolean) => void | Promise<void>,
) => Promise<void> | void

const defaultCard = ({ title, content }: { title?: string; content: string }) =>
  JSON.stringify({
    config: { wide_screen_mode: true },
    elements: [{ tag: 'markdown', content }],
    header: title ? { title: { content: title, tag: 'plain_text' } } : undefined,
  })

const createCard = ({ userMessage, atUserName }: { userMessage: string; atUserName?: string }) => {
  const summary = `回复${atUserName ? ` @${atUserName}` : ''}: ${userMessage}`.trim()
  return {
    type: 'card_json',
    data: JSON.stringify({
      schema: '2.0',
      config: {
        streaming_mode: true,
        summary: { content: summary },
        streaming_config: {
          print_frequency_ms: { default: 70, android: 70, ios: 70, pc: 70 },
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

const genCardMessage = async (
  client: Lark.Client,
  chatId: string,
  question: string,
  senderUnionId?: string,
) => {
  try {
    const { data } = await client.cardkit.v1.card.create({
      data: createCard({ userMessage: question }),
    })
    const cardId = data?.card_id!

    await client.im.v1.message.create({
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

    await client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        content: defaultCard({ content: err }),
        msg_type: 'interactive',
      },
    })
  }
}

let client: Lark.Client

export const sendFeishuMessage = async (
  chatId: string,
  content: string,
  atUserUnionId?: string,
) => {
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
                text: atUserUnionId ? `<at user_id="${atUserUnionId}"></at> \n${content}` : content,
              },
            ],
          ],
        },
      }),
      msg_type: 'post',
    },
  })
}

const handleMessage = async (data: FeishuMessageData, callback: Callback) => {
  const { chat_id, content, chat_type, mentions } = data.message

  if (chat_type === 'group') {
    if (!mentions?.length) return
    const mentionName = mentions[0]?.name || ''
    if (mentionName.toLowerCase() !== (process.env.FEISHU_APP_NAME || 'manbot').toLowerCase()) {
      return
    }
  }

  const contentRes: { text: string } = JSON.parse(content)
  const question = contentRes.text.replace('@_user_1', '').trim()
  const senderUnionId = data.sender.sender_id?.union_id

  let cardId: string | undefined
  let sequence = 0
  let allReplyContent = ''

  await callback(data, async (replyContent, isEnd = false) => {
    if (!cardId) {
      cardId = await genCardMessage(client, chat_id, question, senderUnionId)
      if (!cardId) return
    }

    try {
      if (replyContent) {
        allReplyContent += replyContent
        await client.cardkit.v1.cardElement.content({
          path: { card_id: cardId, element_id: 'markdown_1' },
          data: { content: allReplyContent, sequence: sequence++ },
        })
      }
      if (isEnd) {
        await client.cardkit.v1.cardElement.delete({
          path: { card_id: cardId, element_id: 'tips' },
          data: { sequence: sequence++ },
        })
        cardId = undefined
      }
    } catch (e) {
      console.error(e)
    }
  })
}

export const createFeishu = async (config: FeishuConfig, callback: Callback) => {
  const { appId, appSecret } = config
  client = new Lark.Client({ appId, appSecret })
  const wsClient = new Lark.WSClient({ appId, appSecret })

  const eventDispatcher = new Lark.EventDispatcher({}).register({
    'im.message.receive_v1': (data) =>
      handleMessage(data as unknown as FeishuMessageData, callback),
  })
  await wsClient.start({ eventDispatcher })
}

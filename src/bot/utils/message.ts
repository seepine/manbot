import { join } from 'node:path'
import type { MessageContent, MessageMeta } from '../../channels/channel'
import { mkdirSync } from 'node:fs'
import { logger } from '../../log.ts'

type Message = {
  chatId: string
  senderId: string
  isGroup: boolean
  messages: Array<MessageContent>
}

type MessageObj = {
  [chatId: string]: Message
}

const getFile = async (agentDir: string) => {
  const dir = join(agentDir, 'message')
  mkdirSync(dir, { recursive: true })
  return Bun.file(join(dir, 'data.json'))
}

export const readMessages = async (agentDir: string): Promise<Message | undefined> => {
  try {
    const file = await getFile(agentDir)
    // 文件不存在则创建一个，避免后续读文件报错绕过去
    if (!(await file.exists())) {
      await file.write('{}')
    }
    const text = await file.text()
    if (!text || text === '{}') {
      return undefined
    }
    const obj: MessageObj = JSON.parse(text) || {}
    for (const [_chatId, data] of Object.entries(obj)) {
      if (data.messages.length > 0) {
        return data
      }
    }
    return undefined
  } catch (error) {
    logger.error({ error }, 'readMessages failed')
    return undefined
  }
}

export const saveMessages = async (
  agentDir: string,
  meta: Omit<Message, 'messages'>,
  content: Array<MessageContent>,
  popSize: number = 0,
) => {
  try {
    const file = await getFile(agentDir)
    const text = await file.text()
    let obj: MessageObj = {}
    try {
      obj = text ? JSON.parse(text) : {}
    } catch {
      obj = {}
    }
    const data = obj[meta.chatId] || {
      ...meta,
      messages: [],
    }
    if (popSize > 0) {
      data.messages.splice(0, popSize)
    }
    data.messages.push(...content)
    obj[meta.chatId] = data
    await file.write(JSON.stringify(obj, null, 2))
  } catch (error) {
    logger.error({ error }, 'saveMessages failed')
  }
}

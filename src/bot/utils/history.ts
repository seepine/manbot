import { DynamicStructuredTool } from 'langchain'
import { join } from 'path'
import { MD5 } from 'bun'
import { mkdir } from 'fs/promises'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export const readHistoryMessages = async (workspaceDir: string, chatId: string) => {
  const historyFilePath = join(
    workspaceDir,
    '.agents',
    'history',
    `${MD5.hash(chatId, 'hex')}.json`,
  )
  try {
    const history: ChatMessage[] = (await Bun.file(historyFilePath).json()) || []
    return history.filter((item) => item.role === 'user' || item.role === 'assistant')
  } catch (err) {
    return []
  }
}
const { MAX_MESSAGES = '20' } = process.env
const maxMessages = parseInt(MAX_MESSAGES, 10)

export const saveHistoryMessages = async (
  workspaceDir: string,
  chatId: string,
  messages: ChatMessage[],
) => {
  const historyFilePath = join(
    workspaceDir,
    '.agents',
    'history',
    `${MD5.hash(chatId, 'hex')}.json`,
  )
  const file = Bun.file(historyFilePath)
  if (!(await file.exists())) {
    await mkdir(join(workspaceDir, '.agents', 'history'), { recursive: true })
    await file.write(JSON.stringify('[]', null, 2))
  }
  let history = []
  try {
    history = await file.json()
  } catch (err) {
    await file.delete()
  }
  if (!Array.isArray(history)) {
    history = []
  }
  while (history.length > maxMessages) {
    history.shift()
  }
  history.push(...messages)
  await file.write(JSON.stringify(history, null, 2))
}

// return [
//   new DynamicStructuredTool({
//     name: 'systemtools__read_history_message',
//     description: '读取历史记录',
//     schema: z.object({}),
//     func: async () => {
//       const historyFilePath = join(workspaceDir, '.agents', 'history', `${chatId}.json`)
//       let content = ''
//       try {
//         content = await Bun.file(historyFilePath).text()
//       } catch (err) {}
//       return `历史记录: \n${content}`
//     },
//   }),
//   new DynamicStructuredTool({
//     name: 'systemtools__save_history_message',
//     description: '保存历史记录',
//     schema: z.object({
//       userMessage: z.string().describe('用户消息'),
//       assistantSummary: z.string().describe('助手消息摘要'),
//     }),
//     func: async ({ userMessage, assistantSummary }) => {
//       const historyFilePath = join(workspaceDir, '.agents', 'history', `${chatId}.json`)
//       const file = Bun.file(historyFilePath)
//       let history = []
//       try {
//         history = await file.json()
//       } catch (err) {}
//       if (!Array.isArray(history)) {
//         history = []
//       }
//       history.push([
//         {
//           role: 'user',
//           content: userMessage,
//         },
//         {
//           role: 'assistant',
//           content: assistantSummary,
//         },
//       ])
//       await file.write(JSON.stringify(history, null, 2))
//       return 'ok'
//     },
//   }),
// ]

import { MD5 } from 'bun'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Messages } from './types'
import { logger } from '../log'

export abstract class Memory {
  constructor(protected memoryId: string) {}

  abstract read(): Promise<Messages>
  abstract save(messages: Messages): Promise<void>
}

export class FileMemory extends Memory {
  constructor(
    memoryId: string,
    protected fileDir: string,
    // 模式
    // - normal 为正常读写
    // - save-only 为只保存不读取，用于默认不填充上下文，让tool调用时才填充历史对话，适合对话过长时的场景
    // - slim  只读取少量，避免过长污染
    protected mode: 'normal' | 'save-only' | 'slim',
  ) {
    super(memoryId)
  }

  private getFile() {
    mkdirSync(this.fileDir, { recursive: true })
    const historyFilePath = join(this.fileDir, 'history', `${MD5.hash(this.memoryId, 'hex')}.json`)
    return Bun.file(historyFilePath)
  }

  async read() {
    try {
      if (this.mode === 'save-only') {
        return []
      }
      const file = this.getFile()
      if (!(await file.exists())) {
        return []
      }
      const history: Messages = JSON.parse((await file.text()) || '[]')
      const messages = history.filter((item) => item.role === 'user' || item.role === 'assistant')
      if (this.mode === 'slim') {
        return messages.slice(-4)
      }
      return messages
    } catch (err) {
      logger.error(err, '[file-memory] read error')
      return []
    }
  }

  async save(messages: Messages) {
    try {
      const file = this.getFile()
      await file.write(JSON.stringify(messages))
    } catch (err) {
      logger.error(err, '[file-memory] save error')
    }
  }
}

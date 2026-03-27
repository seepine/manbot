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
      const file = this.getFile()
      const history: Messages = JSON.parse((await file.text()) || '[]')
      return history.filter((item) => item.role === 'user' || item.role === 'assistant')
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

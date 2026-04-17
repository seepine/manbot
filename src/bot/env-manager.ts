import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '../log.ts'
import { cache } from '../common/cache.ts'

export class EnvManager {
  private envFilePath: string

  constructor(protected agentDir: string) {
    this.envFilePath = this.getEnvFilePath()
  }

  private getEnvFilePath(): string {
    const dir = join(this.agentDir, 'env')
    mkdirSync(dir, { recursive: true })
    return join(dir, 'env.json')
  }

  private async readEnvsk(): Promise<Record<string, string>> {
    const file = Bun.file(this.envFilePath)
    if (!(await file.exists())) {
      return {}
    }
    try {
      const cache = await file.json()
      if (!cache || typeof cache !== 'object' || Array.isArray(cache)) {
        return {}
      }
      const entries = Object.entries(cache).filter(
        ([key, value]) => typeof key === 'string' && typeof value === 'string',
      )
      return Object.fromEntries(entries) as Record<string, string>
    } catch (error) {
      logger.error({ error }, '[env] Failed to load envs')
      return {}
    }
  }

  async addEnv(name: string, value: string): Promise<void> {
    return cache.lock(`envs_${this.agentDir}`, async () => {
      const envs = await this.readEnvsk()
      envs[name] = value
      const file = Bun.file(this.envFilePath)
      logger.info(envs, '[env] Persisting envs')
      await file.write(JSON.stringify(envs, null, 2))
    })
  }

  async delEnv(name: string): Promise<boolean> {
    return cache.lock(`envs_${this.agentDir}`, async () => {
      const envs = await this.readEnvsk()
      const exists = name in envs
      if (!exists) {
        return false
      }
      delete envs[name]
      const file = Bun.file(this.envFilePath)
      logger.info(envs, '[env] Persisting envs')
      await file.write(JSON.stringify(envs, null, 2))
      return true
    })
  }

  async getAllEnvs(): Promise<Record<string, string>> {
    return cache.lock(`envs_${this.agentDir}`, async () => {
      return this.readEnvsk()
    })
  }
}

export { EnvManager as default }

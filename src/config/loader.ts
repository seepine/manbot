import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import type { Config, ProviderConfig, AgentProviderConfig } from './types.ts'

function resolveEnvVariables(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, envVar) => process.env[envVar] || '')
}

function processValue(val: unknown): unknown {
  if (typeof val === 'string') {
    return resolveEnvVariables(val)
  }
  if (Array.isArray(val)) {
    return val.map(processValue)
  }
  if (val && typeof val === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(val)) {
      result[k] = processValue(v)
    }
    return result
  }
  return val
}

const getConfigFile = async (configPath?: string) => {
  const paths: string[] = []
  if (configPath) {
    paths.push(configPath.startsWith('/') ? configPath : join(process.cwd(), configPath))
  }
  paths.push(...[join(process.cwd(), 'config.yml'), join(process.cwd(), 'config.yaml')])
  for (const path of paths) {
    const file = Bun.file(path)
    if (await file.exists()) {
      return file
    }
  }
  throw new Error('config.yml 文件不存在')
}

export async function loadConfig(configPath?: string): Promise<Config> {
  const configFile = await getConfigFile(configPath)
  const raw = yaml.load(await configFile.text()) as Record<string, unknown>
  const processed = processValue(raw) as Config

  // Validate required fields
  if (!processed.providers || Object.keys(processed.providers).length === 0) {
    throw new Error('config.yml 中必须至少配置一个 provider')
  }
  for (const [name, provider] of Object.entries(processed.providers)) {
    if (!provider['api-key']) {
      throw new Error(`provider "${name}" 的 api-key 为必填字段`)
    }
  }

  if (!processed.agents || Object.entries(processed.agents).length === 0) {
    throw new Error('config.yml 中必须至少配置一个 agent')
  }

  for (const [name, agentConfig] of Object.entries(processed.agents)) {
    if (!agentConfig.provider?.name || !agentConfig.provider?.model) {
      throw new Error(`agent "${name}" 的 provider.name 和 provider.model 为必填字段`)
    }

    if (agentConfig.channel.type === 'feishu') {
      if (!agentConfig.channel?.['app-id'] || !agentConfig.channel?.['app-secret']) {
        throw new Error(`agent "${name}" 的 channel.app-id 和 channel.app-secret 为必填字段`)
      }
    }
  }
  return processed
}

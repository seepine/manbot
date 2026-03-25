import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import type { Config, ProviderConfig, AgentConfig } from './types.ts'

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

function mergeProvider(defaultProvider: ProviderConfig, agentProvider?: Partial<ProviderConfig>): ProviderConfig {
  if (!agentProvider) return defaultProvider
  return { ...defaultProvider, ...agentProvider }
}

export function loadConfig(configPath?: string): Config {
  const path = configPath || join(process.cwd(), 'config.yml')
  const fileContent = readFileSync(path, 'utf-8')
  const raw = yaml.load(fileContent) as Record<string, unknown>
  const processed = processValue(raw) as Config

  // Validate required fields
  if (!processed.provider?.['api-key'] || !processed.provider?.model) {
    throw new Error('config.yml 中 provider.api-key 和 provider.model 为必填字段')
  }
  if (!processed.agents || Object.keys(processed.agents).length === 0) {
    throw new Error('config.yml 中必须至少配置一个 agent')
  }
  for (const [name, agentConfig] of Object.entries(processed.agents)) {
    if (!agentConfig.channel?.['app-id'] || !agentConfig.channel?.['app-secret']) {
      throw new Error(`agent "${name}" 的 channel.app-id 和 channel.app-secret 为必填字段`)
    }
  }
  return processed
}

export function mergeConfig(defaultProvider: ProviderConfig, agentConfig: AgentConfig): ProviderConfig {
  return mergeProvider(defaultProvider, agentConfig.provider)
}
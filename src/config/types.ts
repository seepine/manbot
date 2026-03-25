export interface ProviderConfig {
  type: 'openai' | 'anthropic'
  'base-url'?: string
  'api-key': string
  model: string
  timeout?: number
  temperature?: number
  'top-p'?: number
  'recursion-limit'?: number
  'auto-tool-discovery'?: boolean
  'show-thinking'?: boolean
}

export interface FeishuChannelConfig {
  type: 'feishu'
  'app-id': string
  'app-secret': string
  'app-name'?: string
}

export type ChannelConfig = FeishuChannelConfig

export interface AgentConfig {
  'workspace-dir'?: string
  provider?: Partial<ProviderConfig>
  channel: ChannelConfig
}

export interface Config {
  provider: ProviderConfig
  agents: Record<string, AgentConfig>
}

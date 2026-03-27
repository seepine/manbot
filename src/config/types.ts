// Base provider configuration
export interface ProviderConfig {
  type: 'openai' | 'anthropic'
  'base-url'?: string
  'api-key': string

  timeout?: number
  temperature?: number
  'top-p'?: number

  'recursion-limit'?: number
  'auto-tool-discovery'?: boolean
  'show-thinking-message'?: boolean
  'show-tool-message'?: boolean
}

// Agent's provider reference
export interface AgentProviderConfig {
  name: string
  model: string

  timeout?: number
  temperature?: number
  'top-p'?: number

  'recursion-limit'?: number
  'auto-tool-discovery'?: boolean
  'show-thinking-message'?: boolean
  'show-tool-message'?: boolean
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
  provider: AgentProviderConfig
  channel: ChannelConfig
}

export interface Config {
  providers: Record<string, ProviderConfig>
  agents: Record<string, AgentConfig>
}

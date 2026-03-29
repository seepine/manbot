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
  /**
   * 无需@也要答复的群聊列表，格式为 ["chat_id1", "chat_id2"]，如果不配置则默认所有群聊都需要@才会答复
   */
  'reply-without-mention-groups'?: string[]
}

export type ChannelConfig = FeishuChannelConfig

export interface AgentConfig {
  'workspace-dir'?: string
  provider: AgentProviderConfig
  channel: ChannelConfig
  'to-agents'?: string[]
}

export interface Config {
  providers: Record<string, ProviderConfig>
  agents: Record<string, AgentConfig>
}

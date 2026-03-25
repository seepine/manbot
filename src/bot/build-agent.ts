import { createAgent, type DynamicStructuredTool } from 'langchain'
import { ChatOpenAICompletions } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { existsSync, mkdirSync } from 'node:fs'
import type { ProviderConfig } from '../config/types.ts'
import { loadMcpTools } from './mcp-loader.ts'
import { loadPromptTools } from './prompt-loader.ts'
import { systemInnerTools } from './tools/system.ts'
import { createInnerMcpTools } from './tools/mcp.ts'
import { createDownloadTools } from './tools/download.ts'
import { createSkillsTools } from './tools/skills.ts'
import { ToolRegistry } from './tool-registry.ts'

export interface BuildAgentOptions {
  additionalTools?: DynamicStructuredTool[]
  additionalSystemPrompt?: string
  workspace?: string
  config?: ProviderConfig
}

/**
 * Build an agent for task execution or sub-agent use.
 * This is a factory function to create lightweight agents without channel integration.
 */
export async function buildAgent(opts: BuildAgentOptions = {}) {
  const { additionalTools = [], additionalSystemPrompt = '', workspace = '/tmp/manbot-build', config } = opts

  // Ensure workspace exists
  if (!existsSync(workspace)) {
    mkdirSync(workspace, { recursive: true })
  }

  // Create default config if not provided
  const providerConfig: ProviderConfig = config || {
    type: 'openai',
    'api-key': process.env.OPENAI_API_KEY || '',
    model: 'gpt-4o',
  }

  // Create LLM
  const llm =
    providerConfig.type === 'anthropic'
      ? new ChatAnthropic({
          apiKey: providerConfig['api-key'],
          anthropicApiUrl: providerConfig['base-url'] || 'https://api.anthropic.com',
          model: providerConfig.model,
          streaming: true,
          temperature: providerConfig.temperature ?? 0.7,
          topP: providerConfig['top-p'] ?? 0.9,
        })
      : new ChatOpenAICompletions({
          apiKey: providerConfig['api-key'],
          configuration: { baseURL: providerConfig['base-url'] },
          modelName: providerConfig.model,
          streaming: true,
          temperature: providerConfig.temperature ?? 0.7,
          topP: providerConfig['top-p'] ?? 0.9,
          timeout: providerConfig.timeout ?? 120000,
        })

  // Load tools
  const innerMcpTools = await createInnerMcpTools(workspace)
  const [prompt] = await Promise.all([loadPromptTools(workspace)])

  const tools: DynamicStructuredTool[] = [
    ...systemInnerTools,
    ...createDownloadTools(workspace),
    ...createSkillsTools(workspace),
    ...(innerMcpTools?.tools ?? []) as DynamicStructuredTool[],
  ]

  const mcpTools = await loadMcpTools(workspace)
  if (mcpTools?.tools?.length) {
    const toolRegistry = new ToolRegistry()
    toolRegistry.register(mcpTools.tools)
    tools.push(...toolRegistry.createProxyTools())
  }

  // Add additional tools
  tools.push(...additionalTools)

  const systemMessage = additionalSystemPrompt ? `${prompt}\n\n${additionalSystemPrompt}` : prompt

  // Create agent
  const agent = createAgent({
    model: llm,
    tools,
    systemPrompt: systemMessage,
  })

  return agent
}
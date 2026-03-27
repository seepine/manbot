import type { StructuredToolInterface } from '@langchain/core/tools'
import { MultiServerMCPClient, type ClientConfig } from '@langchain/mcp-adapters'
import { httpProxyEnv } from '../utils/env'
import { logger } from '../../log.ts'

type McpServerConfig = ClientConfig['mcpServers']

const defaultRestart = {
  enabled: true,
  maxAttempts: 10,
  delayMs: 2000,
}

export const createInnerMcpTools = async (workspaceFolder: string) => {
  const mcpServers: McpServerConfig = {
    filesystem: {
      type: 'stdio',
      command: 'bunx',
      args: ['-y', '--bun', '@modelcontextprotocol/server-filesystem', workspaceFolder],
      restart: defaultRestart,
    },
  }
  const { env } = process

  // 动态添加其他mcp服务
  if (env.TERMINAL_ALLOWED === 'true') {
    mcpServers['terminal'] = {
      type: 'stdio',
      command: 'bunx',
      args: ['-y', '--bun', '@seepine/mcp-terminal'],
      restart: defaultRestart,
      env: {
        ...httpProxyEnv,
        DEFAULT_CWD: workspaceFolder,
      },
    }
  } else {
    mcpServers['curl'] = {
      type: 'stdio',
      command: 'bunx',
      args: ['-y', '--bun', '@calibress/curl-mcp'],
      restart: defaultRestart,
      env: httpProxyEnv,
    }
  }

  if (env.TAVILY_API_KEY) {
    const apis = env.TAVILY_API_KEY.split(',')
    apis
      .filter((api) => api.trim().startsWith('tvly-'))
      .forEach((api, idx) => {
        mcpServers[`web-search${idx > 0 ? `-${idx}` : ''}`] = {
          type: 'stdio',
          command: `bunx`,
          args: ['-y', '--bun', 'mcp-remote', `https://mcp.tavily.com/mcp/?tavilyApiKey=${api}`],
          restart: defaultRestart,
        }
      })
  }

  const client = new MultiServerMCPClient({
    throwOnLoadError: true,
    prefixToolNameWithServerName: true,
    useStandardContentBlocks: true,
    onConnectionError: 'throw',
    mcpServers,
  })
  const tools = (await client.getTools()).filter(
    // 筛选掉，避免出错
    (item) => item.name !== 'filesystem__read_media_file',
  )

  logger.info(`[内置MCP] 已加载 ${tools.length} 个工具`)
  for (const tool of tools) {
    logger.info(`  - ${tool.name}: ${tool.description?.slice(0, 60) ?? '(无描述)'}`)
  }

  return {
    tools: tools as StructuredToolInterface[],
    client,
  }
}

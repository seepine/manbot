import type { StructuredToolInterface } from '@langchain/core/tools'
import { MultiServerMCPClient, type ClientConfig } from '@langchain/mcp-adapters'
import { join } from 'node:path'

type McpServerConfig = ClientConfig['mcpServers']

export const createInnerMcpTools = async (workspaceFolder: string) => {
  const mcpServers: McpServerConfig = {
    filesystem: {
      type: 'stdio',
      command: 'bunx',
      args: ['-y', '--bun', '@modelcontextprotocol/server-filesystem', workspaceFolder],
    },
    memory: {
      type: 'stdio',
      command: 'bunx',
      args: ['-y', '--bun', '@modelcontextprotocol/server-memory'],
      env: {
        MEMORY_FILE_PATH: join(workspaceFolder, '.data', 'memory-data.jsonl'),
      },
    },
  }
  const { env } = process

  // 动态添加其他mcp服务
  if (env.TERMINAL_ALLOWED === 'true') {
    mcpServers['terminal'] = {
      type: 'stdio',
      command: 'bunx',
      args: ['-y', '--bun', '@seepine/mcp-terminal'],
      env: {
        DEFAULT_CWD: workspaceFolder,
      },
    }
  } else {
    mcpServers['curl'] = {
      type: 'stdio',
      command: 'bunx',
      args: ['-y', '--bun', '@calibress/curl-mcp'],
    }
  }

  if (env.TAVILY_API_KEY) {
    const apis = env.TAVILY_API_KEY.split(',')
    apis
      .filter((api) => api.trim().startsWith('tvly-'))
      .forEach((api, idx) => {
        mcpServers[`tavily-search-server-${idx}`] = {
          type: 'stdio',
          command: `bunx`,
          args: ['-y', '--bun', 'mcp-remote', `https://mcp.tavily.com/mcp/?tavilyApiKey=${api}`],
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
  const tools = await client.getTools()

  console.log(`[内置MCP] 已加载 ${tools.length} 个工具`)
  for (const tool of tools) {
    console.log(`  - ${tool.name}: ${tool.description?.slice(0, 60) ?? '(无描述)'}`)
  }

  return { tools: tools as StructuredToolInterface[], client }
}

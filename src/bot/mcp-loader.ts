import type { StructuredToolInterface } from '@langchain/core/tools'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { HeadersInit } from 'bun'
import { join } from 'node:path'
import MCP_SCHEMA from './assets/mcp.schema.json.txt' with { type: 'txt', embed: 'true' }
import MCP_CONFIG from './assets/mcp.json.txt' with { type: 'txt', embed: 'true' }
import { httpProxyEnv } from './utils/env'

export type McpTransport =
  | {
      type?: 'stdio'
      command: 'npx' | 'uvx' | 'bunx' | 'docker' | string
      args: string[]
      env?: Record<string, string>
      cwd?: string
    }
  | {
      // @deprecated use streamableHTTP
      type: 'sse'
      url: string
    }
  | {
      type: 'http'
      url: string
      headers?: HeadersInit
    }

export type McpClientOpts = {
  description?: string
  version?: string
} & McpTransport

interface McpsConfig {
  mcpServers: Record<string, McpClientOpts>
}

export interface McpToolsResult {
  tools: StructuredToolInterface[]
  client: MultiServerMCPClient | null
}

const initialMcp = async (workspace: string) => {
  const schemaFile = Bun.file(join(workspace, 'mcp.schema.json'))
  if (!(await schemaFile.exists())) {
    await schemaFile.write(MCP_SCHEMA)
  }
  const file = Bun.file(join(workspace, 'mcp.json'))
  if (!(await file.exists())) {
    await file.write(MCP_CONFIG)
  }
}

let _lastMcpFileMd5: string | null | undefined = undefined
export const mcpToolsHasChanged = async (workspace: string): Promise<boolean> => {
  const file = Bun.file(join(workspace, 'mcp.json'))
  if (!(await file.exists())) {
    await initialMcp(workspace)
  }
  let currentMd5: string | null = null
  if (await file.exists()) {
    const hasher = new Bun.CryptoHasher('md5')
    hasher.update(await file.arrayBuffer())
    currentMd5 = hasher.digest('hex')
  }
  const hasChanged = currentMd5 !== _lastMcpFileMd5
  _lastMcpFileMd5 = currentMd5
  return hasChanged
}

/**
 * 从 mcps.json 读取 MCP 服务配置，启动所有 MCP 服务并返回工具列表和 client 实例
 */
export const loadMcpTools = async (workspace: string): Promise<McpToolsResult> => {
  console.log('[mcp] mcp 加载中，请稍后...')
  const file = Bun.file(join(workspace, 'mcp.json'))
  if (!(await file.exists())) {
    await initialMcp(workspace)
  }
  const fileText = await file.text()
  let config: McpsConfig
  try {
    config = JSON.parse(fileText.replaceAll('${workspaceFolder}', workspace))
  } catch (e) {
    console.error('[MCP] mcp.json 格式错误，请检查文件内容', e)
    return { tools: [], client: null }
  }
  // 将 mcps.json 的格式转换为 MultiServerMCPClient 期望的格式
  const mcpServers: Record<string, McpClientOpts> = {}
  for (const [name, server] of Object.entries(config.mcpServers || {})) {
    if (server.type === 'sse') {
      mcpServers[name] = server
    } else if (server.type === 'http') {
      mcpServers[name] = server
    } else if (server.type === 'stdio' || (server.type === undefined && server.command)) {
      if (server.args.includes('@modelcontextprotocol/server-filesystem')) {
        console.warn(
          '@modelcontextprotocol/server-filesystem 已内置在系统中，无需在mcp.json中重复配置，此配置将不会生效',
        )
        continue
      }
      mcpServers[name] = {
        ...server,
        env: {
          ...httpProxyEnv,
          ...server.env,
        },
      }
    } else {
      console.warn(`[MCP] ${name} 的配置格式不正确，跳过该 MCP 服务`)
    }
  }
  if (Object.keys(mcpServers).length === 0) {
    return { tools: [], client: null }
  }
  const client = new MultiServerMCPClient({
    throwOnLoadError: false,
    prefixToolNameWithServerName: true,
    useStandardContentBlocks: true,
    onConnectionError: 'ignore',
    mcpServers: mcpServers,
  } as any)

  const tools = await client.getTools()
  console.log(`[MCP] 已加载 ${tools.length} 个工具`)
  for (const tool of tools) {
    console.log(`  - ${tool.name}: ${tool.description?.slice(0, 60) ?? '(无描述)'}`)
  }
  return { tools: tools as StructuredToolInterface[], client }
}

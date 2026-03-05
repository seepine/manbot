import type { StructuredToolInterface } from '@langchain/core/tools'
import { MultiServerMCPClient, type ClientConfig } from '@langchain/mcp-adapters'
import { join } from 'node:path'
import MCP_SCHEMA from './assets/mcp.schema.json.txt' with { type: 'txt', embed: 'true' }
import MCP_CONFIG from './assets/mcp.json.txt' with { type: 'txt', embed: 'true' }
import { httpProxyEnv } from './utils/env'

/**
 * MCP 服务传输层配置。
 *
 * - `stdio`: 通过子进程标准输入输出通信，适合本地命令启动。
 * - `sse/http`: 通过远程 HTTP 端点通信。
 */
export type McpTransport =
  | {
      /** 传输类型，省略时默认按 stdio 处理 */
      type?: 'stdio'
      /** 启动 MCP 服务的命令 */
      command: 'npx' | 'uvx' | 'bunx' | 'docker' | string
      /** 传给命令的参数列表 */
      args: string[]
      /** 子进程环境变量 */
      env?: Record<string, string>
      /** 子进程工作目录 */
      cwd?: string
      /** stdio 进程异常退出后的自动重启策略 */
      restart?: {
        /** 是否启用自动重启 */
        enabled?: boolean
        /** 最大重试次数 */
        maxAttempts?: number
        /** 两次重试间隔（毫秒） */
        delayMs?: number
      }
    }
  | {
      // @deprecated use streamableHTTP
      /** SSE 远程服务 */
      type: 'sse'
      /** SSE 服务 URL */
      url: string
      /** 连接断开后的自动重连策略 */
      reconnect?: {
        /** 是否启用自动重连 */
        enabled?: boolean
        /** 最大重连次数 */
        maxAttempts?: number
        /** 两次重连间隔（毫秒） */
        delayMs?: number
      }
    }
  | {
      /** HTTP 远程服务 */
      type: 'http'
      /** HTTP 服务 URL */
      url: string
      /** 请求头 */
      headers?: Record<string, string>
      /** 连接断开后的自动重连策略 */
      reconnect?: {
        /** 是否启用自动重连 */
        enabled?: boolean
        /** 最大重连次数 */
        maxAttempts?: number
        /** 两次重连间隔（毫秒） */
        delayMs?: number
      }
    }

/** 单个 MCP 服务配置（可附加描述与版本） */
export type McpClientOpts = {
  /** 服务说明，用于人类阅读 */
  description?: string
  /** 服务版本号（可选） */
  version?: string
} & McpTransport

/** mcp.json 顶层结构 */
interface McpsConfig {
  /** MCP 服务列表，key 为服务名 */
  mcpServers: Record<string, McpClientOpts>
}

/** MCP 工具加载结果 */
export interface McpToolsResult {
  /** 已成功加载的工具集合 */
  tools: StructuredToolInterface[]
  /** MCP 客户端实例，未加载成功时为 null */
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
  const mcpServers: ClientConfig['mcpServers'] = {}
  for (const [name, server] of Object.entries(config.mcpServers || {})) {
    const { description: _description, version: _version, ...serverConfig } = server
    if (server.type === 'sse') {
      mcpServers[name] = {
        ...serverConfig,
        reconnect: {
          enabled: true,
          maxAttempts: 10,
          delayMs: 2000,
          ...server.reconnect,
        },
      }
    } else if (server.type === 'http') {
      mcpServers[name] = {
        ...serverConfig,
        reconnect: {
          enabled: true,
          maxAttempts: 10,
          delayMs: 2000,
          ...server.reconnect,
        },
      }
    } else if (server.type === 'stdio' || (server.type === undefined && server.command)) {
      if (server.args.includes('@modelcontextprotocol/server-filesystem')) {
        console.warn(
          '@modelcontextprotocol/server-filesystem 已内置在系统中，无需在mcp.json中重复配置，此配置将不会生效',
        )
        continue
      }
      mcpServers[name] = {
        type: 'stdio',
        command: server.command,
        args: server.args,
        cwd: server.cwd,
        restart: {
          enabled: true,
          maxAttempts: 10,
          delayMs: 2000,
          ...server.restart,
        },
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
  })

  const tools = await client.getTools()
  console.log(`[MCP] 已加载 ${tools.length} 个工具`)
  for (const tool of tools) {
    console.log(`  - ${tool.name}: ${tool.description?.slice(0, 60) ?? '(无描述)'}`)
  }
  return { tools: tools as StructuredToolInterface[], client }
}

import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { logger } from '../log.ts'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'

/** MCP 工具加载结果 */
export interface McpToolsResult {
  /** 已成功加载的工具集合 */
  tools: StructuredToolInterface[]
  /** MCP 客户端实例，未加载成功时为 null */
  client: MultiServerMCPClient | null
}

export type McpTransport =
  | {
      type?: 'stdio'
      command: string
      args: string[]
      env?: Record<string, string>
      cwd?: string
      restart?: { enabled?: boolean; maxAttempts?: number; delayMs?: number }
    }
  | {
      type: 'sse'
      url: string
      reconnect?: { enabled?: boolean; maxAttempts?: number; delayMs?: number }
    }
  | {
      type: 'http'
      url: string
      headers?: Record<string, string>
      reconnect?: { enabled?: boolean; maxAttempts?: number; delayMs?: number }
    }

export type McpClientOpts = { description?: string; version?: string } & McpTransport

// Schema for stdio transport
const stdioSchema = z.object({
  type: z.literal('stdio').default('stdio'),
  command: z.string().describe('启动命令，如 bunx、npx、uvx、docker'),
  args: z.array(z.string()).describe('命令参数列表'),
  env: z.record(z.string(), z.string()).optional().describe('环境变量'),
})

// Schema for http transport
const httpSchema = z.object({
  type: z.literal('http'),
  url: z.url().describe('HTTP 服务 URL'),
  headers: z.record(z.string(), z.string()).optional().describe('请求头'),
})

// Schema for sse transport
const sseSchema = z.object({
  type: z.literal('sse'),
  url: z.string().describe('SSE 服务 URL'),
})

// Combined add_mcp schema - transforms to McpClientOpts (name is the key, not part of opts)
export const addMcpSchema = z
  .object({
    name: z.string().describe('MCP 服务名称，唯一标识'),
    description: z.string().optional().describe('服务说明'),
    version: z.string().optional().describe('服务版本'),
    stdio: stdioSchema.omit({ type: true }).optional(),
    http: httpSchema.omit({ type: true }).optional(),
    sse: sseSchema.omit({ type: true }).optional(),
  })
  .refine(
    (data) => {
      if (data.stdio) return true
      if (data.http) return true
      if (data.sse) return true
      return false
    },
    { message: '必须提供 stdio、http 或 sse 配置之一' },
  )
  .transform((data) => {
    if (data.stdio) {
      return {
        description: data.description,
        version: data.version,
        type: 'stdio' as const,
        ...data.stdio,
      }
    }
    if (data.http) {
      return {
        description: data.description,
        version: data.version,
        type: 'http' as const,
        ...data.http,
      }
    }
    if (data.sse) {
      return {
        description: data.description,
        version: data.version,
        type: 'sse' as const,
        ...data.sse,
      }
    }
    throw new Error('Invalid configuration')
  })

export const delMcpSchema = z.object({
  name: z.string().describe('要删除的 MCP 服务名称'),
})

export class McpManager {
  private mcps: Record<string, McpClientOpts> = {}
  private agentDir: string
  private mcpFilePath: string

  constructor(agentDir: string) {
    this.agentDir = agentDir
    this.mcpFilePath = this.getMcpFilePath()
  }

  private getMcpFilePath(): string {
    const dir = join(this.agentDir, 'mcp')
    mkdirSync(dir, { recursive: true })
    return join(dir, 'mcp.json')
  }

  private async persistenceMcps(): Promise<void> {
    const file = Bun.file(this.mcpFilePath)
    logger.info(this.mcps, '[mcp] Persisting mcps')
    await file.write(JSON.stringify({ mcpServers: this.mcps }, null, 2))
  }

  async loadMcps(): Promise<void> {
    const file = Bun.file(this.mcpFilePath)
    if (!(await file.exists())) return
    try {
      const cache: { mcpServers?: Record<string, McpClientOpts> } = (await file.json()) || {}
      this.mcps = cache.mcpServers || {}
    } catch (error) {
      logger.error({ error }, '[mcp] Failed to load mcps')
    }
  }

  async addMcp(name: string, opts: McpClientOpts): Promise<void> {
    if (this.mcps[name]) {
      throw new Error(`MCP server "${name}" already exists`)
    }
    this.mcps[name] = opts
    await this.persistenceMcps()
  }

  async delMcp(name: string): Promise<void> {
    delete this.mcps[name]
    await this.persistenceMcps()
  }

  getMcp(name: string): McpClientOpts | undefined {
    return this.mcps[name]
  }

  getAllMcps(): Record<string, McpClientOpts> {
    return this.mcps
  }

  async loadMcpTools(): Promise<McpToolsResult> {
    if (Object.keys(this.mcps).length === 0) {
      return { tools: [], client: null }
    }
    const client = new MultiServerMCPClient({
      throwOnLoadError: false,
      prefixToolNameWithServerName: true,
      useStandardContentBlocks: true,
      onConnectionError: 'ignore',
      mcpServers: this.mcps,
    })

    const tools = await client.getTools()
    logger.info(`[MCP] 已加载 ${tools.length} 个工具`)
    for (const tool of tools) {
      logger.info(`  - ${tool.name}: ${tool.description?.slice(0, 60).trim() ?? '(无描述)'}`)
    }
    return { tools: tools as StructuredToolInterface[], client }
  }

  createTools(): DynamicStructuredTool[] {
    const self = this
    return [
      new DynamicStructuredTool({
        name: 'mcp-manager__add_mcp',
        description:
          'Add an MCP server configuration. Requires name and transport configuration (stdio or http).',
        schema: addMcpSchema,
        func: async (args) => {
          const parsed = addMcpSchema.parse(args)
          await self.addMcp(args.name, parsed)
          return `MCP server "${args.name}" added successfully`
        },
      }),
      new DynamicStructuredTool({
        name: 'mcp-manager__del_mcp',
        description: 'Delete an MCP server configuration. Requires name.',
        schema: delMcpSchema,
        func: async ({ name }) => {
          const mcp = self.getMcp(name)
          if (!mcp) {
            return `MCP server "${name}" not found`
          }
          await self.delMcp(name)
          return `MCP server "${name}" deleted successfully`
        },
      }),
      new DynamicStructuredTool({
        name: 'mcp-manager__list_mcp',
        description: 'List all configured MCP servers.',
        schema: z.object({}),
        func: async () => {
          const mcps = self.getAllMcps()
          if (Object.keys(mcps).length === 0) {
            return '暂无已配置的 MCP 服务'
          }
          return JSON.stringify(mcps, null, 2)
        },
      }),
    ]
  }
}

export { McpManager as default }

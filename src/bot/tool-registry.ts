import type { StructuredToolInterface } from '@langchain/core/tools'
import { DynamicStructuredTool } from 'langchain'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

type JsonSchemaLike = {
  type?: string
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

/**
 * 工具注册表，支持工具的注册与按需发现/调用
 *
 * 核心思路：将大量工具注册到注册表中，agent 通过 discover + invoke 两个元工具
 * 按需搜索和调用，避免将所有工具塞入 LLM 上下文
 */
export class ToolRegistry {
  private readonly entries = new Map<string, StructuredToolInterface>()

  private tokenizeKeyword(keyword: string): string[] {
    const normalized = keyword.toLowerCase().trim()
    if (!normalized) return []
    const tokens = normalized
      .split(/[\s,，。.、;；:：|/\\_\-+*=!?@#$%^&()\[\]{}<>"'`~]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (tokens.length > 0) {
      return [...new Set(tokens)]
    }
    return [normalized]
  }

  private matchToolByKeyword(
    tool: StructuredToolInterface,
    rawKeyword: string,
    tokens: string[],
  ): { matched: boolean; score: number } {
    if (!rawKeyword) {
      return { matched: true, score: 0 }
    }

    const name = tool.name.toLowerCase()
    const desc = (tool.description || '').toLowerCase()
    const fullMatchInName = name.includes(rawKeyword)
    const fullMatchInDesc = desc.includes(rawKeyword)

    const tokenMatched = tokens.every((token) => name.includes(token) || desc.includes(token))
    if (!fullMatchInName && !fullMatchInDesc && !tokenMatched) {
      return { matched: false, score: 0 }
    }

    let score = 0
    if (fullMatchInName) score += 100
    if (fullMatchInDesc) score += 60
    for (const token of tokens) {
      if (name.includes(token)) score += 20
      else if (desc.includes(token)) score += 8
    }
    return { matched: true, score }
  }

  /**
   * 批量注册工具
   */
  register(...toolSets: StructuredToolInterface[][]): void {
    for (const tools of toolSets) {
      for (const tool of tools) {
        this.entries.set(tool.name, tool)
      }
    }
  }

  /**
   * 获取工具的参数 JSON Schema 描述
   */
  private getToolSchema(tool: StructuredToolInterface): unknown {
    if (!(('schema' in tool) as boolean) || !tool.schema) {
      return {}
    }

    const schema = tool.schema as unknown

    // MCP 工具有可能已经是 JSON Schema，优先原样返回
    if (
      typeof schema === 'object' &&
      schema !== null &&
      ('type' in (schema as JsonSchemaLike) ||
        'properties' in (schema as JsonSchemaLike) ||
        'required' in (schema as JsonSchemaLike))
    ) {
      return schema
    }

    try {
      const converted = zodToJsonSchema(schema as any)
      if (converted && typeof converted === 'object' && Object.keys(converted).length > 0) {
        return converted
      }
    } catch {
      // ignore schema serialization errors
    }

    // 兜底：至少保留可序列化信息，避免 discover 返回空 schema 让模型盲猜
    if (typeof schema === 'object' && schema !== null) {
      try {
        return JSON.parse(JSON.stringify(schema))
      } catch {
        return { schemaType: 'non-serializable' }
      }
    }

    return {}
  }

  /**
   * 创建用于 agent 的发现和调用元工具
   */
  createProxyTools(): DynamicStructuredTool[] {
    return [
      new DynamicStructuredTool({
        name: 'tools__discover',
        description:
          'Search available tools. Returns tool names, descriptions and parameter schemas. Use this when you need to call a tool.',
        schema: z.object({
          keyword: z
            .string()
            .describe(
              'Keyword to search in tool names and descriptions. Use empty string to list all.',
            )
            .optional(),
        }),
        func: async ({ keyword = '' }) => {
          const kw = keyword.toLowerCase().trim()
          const tokens = this.tokenizeKeyword(kw)
          const results: {
            name: string
            description: string
            parameters: unknown
            score: number
          }[] = []

          for (const tool of this.entries.values()) {
            const { matched, score } = this.matchToolByKeyword(tool, kw, tokens)
            if (matched) {
              results.push({
                name: tool.name,
                description: (tool.description || '').slice(0, 200),
                parameters: this.getToolSchema(tool),
                score,
              })
            }
          }

          results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

          return results.length ? JSON.stringify(results, null, 2) : 'No tools found.'
        },
      }),
      new DynamicStructuredTool({
        name: 'tools__invoke',
        description:
          'Invoke a discovered tool by its exact name. Always use tools__discover first to find the tool and its parameter schema.',
        schema: z.object({
          name: z.string().describe('Exact tool name from tools__discover results'),
          input: z.record(z.string(), z.any()).describe('Tool input parameters as key-value pairs'),
        }),
        func: async ({ name, input }) => {
          const tool = this.entries.get(name)
          if (!tool) return `Tool "${name}" not found. Use tools__discover to search.`
          try {
            const result = await tool.invoke(input)
            return typeof result === 'string' ? result : JSON.stringify(result)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (message.includes('did not match expected schema')) {
              return [
                `Error calling "${name}": ${message}`,
                `Provided input: ${JSON.stringify(input)}`,
                `Please call tools__discover with keyword "${name}" and strictly follow the returned parameter schema (required fields + exact field names).`,
              ].join('\n')
            }
            return `Error calling "${name}": ${message}`
          }
        },
      }),
    ]
  }

  get size(): number {
    return this.entries.size
  }
}

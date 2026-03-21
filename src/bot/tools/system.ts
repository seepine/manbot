import dayjs from 'dayjs'
import { DynamicStructuredTool } from 'langchain'
import { z } from 'zod'

import HOW_TO_ADD_MCP from '../assets/how-to-add-or-del-mcp.txt' with {
  type: 'txt',
  embed: 'true',
}

export const systemInnerTools: DynamicStructuredTool[] = [
  new DynamicStructuredTool({
    name: 'systemtools__get_current_date',
    description: 'Get the current date.',
    schema: z.object({}),
    func: async () => {
      const currentDate = dayjs().format('YYYY-MM-DD HH:mm:ss')
      return `Current date is: ${currentDate}`
    },
  }),

  new DynamicStructuredTool({
    name: 'systemtools__how_to_add_or_delete_mcp',
    description: 'How to add or delete a MCP.',
    schema: z.object({}),
    func: async () => HOW_TO_ADD_MCP,
  }),
]

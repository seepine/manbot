import dayjs from 'dayjs'
import { DynamicStructuredTool } from 'langchain'
import { z } from 'zod'

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
]

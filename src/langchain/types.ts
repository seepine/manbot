export type Message = {
  role: 'user' | 'assistant'
  content: string
}
export type Messages = Message[]

export type MessageChunk =
  | {
      type: 'text' | 'thinking'
      content: string
    }
  | {
      type: 'tool_start'
      name: string
      arguments: any
    }
  | {
      type: 'tool_end'
      name: string
    }

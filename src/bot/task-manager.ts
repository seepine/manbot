import { join } from 'path'
import { CronExpressionParser } from 'cron-parser'
import { randomUUID } from 'crypto'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import dayjs from 'dayjs'
import { buildAgent } from './build-agent'
import { sendFeishuMessage } from '../channels/feishu'
import type { FeishuChannelConfig } from '../config/types.ts'

export interface Task {
  status: 'pending' | 'ing'
  cron?: string
  nextRunTime: string
  lastRunTime?: string
  content: string
  isReminder: boolean
  channelConfig: { type: 'feishu'; chatId: string; atUserId: string }
}

let _workspaceFolder: string | undefined
let _feishuChannelConfig: FeishuChannelConfig | undefined
const tasks: Record<string, Task> = {}
const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss'

/**
 * Persist tasks to disk
 */
const persistenceTasks = async () => {
  if (!_workspaceFolder) return
  const file = Bun.file(join(_workspaceFolder, '.agents', 'tasks', 'task.json'))
  await file.write(JSON.stringify(tasks, null, 2))
}

/**
 * Add a new task
 */
const addTask = async (task: Omit<Task, 'status'>) => {
  const taskId = `task_${randomUUID()}`
  tasks[taskId] = { ...task, status: 'pending' }
  await persistenceTasks()
  return taskId
}

/**
 * Delete a task
 */
const delTask = async (taskId: string) => {
  delete tasks[taskId]
  await persistenceTasks()
}

/**
 * Send task execution result
 */
const sendTaskResult = async (taskId: string, task: Task, content: string) => {
  if (!_feishuChannelConfig) return
  const { type, chatId, atUserId } = task.channelConfig
  if (type === 'feishu') {
    await sendFeishuMessage(
      _feishuChannelConfig['app-id'],
      _feishuChannelConfig['app-secret'],
      chatId,
      `> 任务 ${taskId} 执行完毕\n\n${content}`,
      atUserId || '',
    )
  }
}

/**
 * Execute the agent for the task
 */
const runAgent = async (taskId: string, task: Task) => {
  const agent = await buildAgent({
    additionalTools: [
      ...createTaskTool(
        task.channelConfig.type,
        task.channelConfig.chatId,
        task.channelConfig.atUserId,
      ),
    ],
  })

  const prompt = task.isReminder
    ? `任务${taskId}执行时间${dayjs().format(DATE_FORMAT)}到了，请立刻提醒我以下内容\n\n${task.content}`
    : `任务${taskId}执行时间${dayjs().format(DATE_FORMAT)}到了，请立刻执行以下内容\n\n${task.content}`

  const stream = agent.streamEvents(
    { messages: [{ role: 'user', content: prompt }] },
    { version: 'v2', recursionLimit: Number(process.env.RECURSION_LIMIT || '50') },
  )

  let result = ''
  for await (const event of stream) {
    if (event.event === 'on_chat_model_stream') {
      const content = event.data?.chunk?.content
      if (typeof content === 'string') result += content
    } else if (event.event === 'on_tool_start') {
      result += `\n> [调用工具: ${event.name}]\n`
    } else if (event.event === 'on_tool_end') {
      result += `\n> [工具 ${event.name} 返回完毕]\n`
    }
  }
  return result
}

/**
 * Schedule the next run for a task or remove it
 */
const scheduleNextRun = (taskId: string, task: Task) => {
  if (task.cron) {
    const next = CronExpressionParser.parse(task.cron).next()
    if (next) {
      tasks[taskId] = {
        ...task,
        status: 'pending',
        lastRunTime: dayjs().format(DATE_FORMAT),
        nextRunTime: dayjs(next.toDate()).format(DATE_FORMAT),
      }
      return
    }
  }
  delete tasks[taskId]
}

/**
 * Execute a single task
 */
const executeTask = async (taskId: string, task: Task) => {
  try {
    const result = await runAgent(taskId, task)
    if (result) {
      await sendTaskResult(taskId, task, result)
    }
  } catch (error) {
    console.error(`Error executing task ${taskId}:`, error)
  } finally {
    scheduleNextRun(taskId, task)
    await persistenceTasks()
  }
}

/**
 * Load tasks from disk
 */
const loadTasks = async (workspaceFolder: string) => {
  const file = Bun.file(join(workspaceFolder, '.agents', 'tasks', 'task.json'))
  if (!(await file.exists())) return
  try {
    const cache: Record<string, Task> = (await file.json()) || {}
    for (const [id, task] of Object.entries(cache)) {
      if (!tasks[id]) {
        tasks[id] = { ...task, status: 'pending' }
      }
    }
  } catch (error) {
    console.error('Failed to load tasks:', error)
  }
}

/**
 * Start the task processing loop
 */
export const startTasksProcess = async (workspaceFolder: string, feishuChannelConfig?: FeishuChannelConfig) => {
  if (_workspaceFolder) return
  _workspaceFolder = workspaceFolder
  _feishuChannelConfig = feishuChannelConfig

  await loadTasks(workspaceFolder)

  // Heartbeat loop
  setInterval(async () => {
    const now = dayjs()
    for (const [taskId, task] of Object.entries(tasks)) {
      if (task.status === 'ing') continue

      const nextRunTime = dayjs(task.nextRunTime)
      if (nextRunTime.isAfter(now)) continue

      // Mark as executing
      tasks[taskId] = { ...task, status: 'ing' }
      await persistenceTasks()

      // Execute asynchronously
      executeTask(taskId, tasks[taskId])
    }
  }, 30 * 1000)
}

/**
 * Create tools for task management
 */
export function createTaskTool(type: 'feishu', chatId: string, senderUnionId: string) {
  return [
    new DynamicStructuredTool({
      name: 'task-manager__add_task',
      description: 'Add a task. Requires task content, cron expression, nextRunTime, and chat ID.',
      schema: z.object({
        cron: z
          .string()
          .describe('Cron expression for task scheduling, 当循环任务时必填')
          .optional(),
        isReminder: z.boolean().describe('是否为提醒消息，若任务内容不需要执行或思考，则为true'),
        nextRunTime: z
          .string()
          .describe('Next run time for the task, 格式为 "YYYY-MM-DD HH:mm:ss"'),
        content: z.string().describe('Content of the task'),
      }),
      func: async (args) => {
        const taskId = await addTask({
          ...args,
          channelConfig: { type, chatId, atUserId: senderUnionId },
        })
        return `Task added successfully with ID: ${taskId}`
      },
    }),
    new DynamicStructuredTool({
      name: 'task-manager__del_task',
      description: 'Delete a task. Requires task ID.',
      schema: z.object({
        taskId: z.string().describe('ID of the task to delete'),
      }),
      func: async ({ taskId }) => {
        await delTask(taskId)
        return `Task deleted successfully with ID: ${taskId}`
      },
    }),
    new DynamicStructuredTool({
      name: 'task-manager__get_task',
      description: 'Get a task. Requires task ID.',
      schema: z.object({
        taskId: z.string().describe('ID of the task to get'),
      }),
      func: async ({ taskId }) => {
        const task = tasks[taskId]
        return task ? JSON.stringify(task, null, 2) : `Task not found with ID: ${taskId}`
      },
    }),
    new DynamicStructuredTool({
      name: 'task-manager__get_all_task',
      description: 'Get all tasks.',
      schema: z.object({}),
      func: async () => JSON.stringify(tasks, null, 2),
    }),
  ]
}

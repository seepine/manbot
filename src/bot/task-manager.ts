import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { CronExpressionParser } from 'cron-parser'
import { randomUUID } from 'crypto'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import dayjs from 'dayjs'
import { sendFeishuMessage } from '../channels/feishu'
import type { ChannelConfig } from '../config/types.ts'
import { logger } from '../log.ts'
import type { EasyAgent } from '../langchain/easy-agent.ts'

export interface Task {
  status: 'pending' | 'ing'
  cron?: string
  nextRunTime: string
  lastRunTime?: string
  content: string
  isReminder: boolean
  channelConfig: { type: 'feishu'; chatId: string; atUserId: string }
}

export class TaskManager {
  private tasks: Record<string, Task> = {}
  private agentDir: string
  private channelConfig: ChannelConfig | undefined
  private heartbeatInterval: NodeJS.Timeout | null = null
  private dateFormat = 'YYYY-MM-DD HH:mm:ss'
  private taskFilePath: string

  constructor(agentDir: string, channelConfig?: ChannelConfig) {
    this.agentDir = agentDir
    this.channelConfig = channelConfig
    this.taskFilePath = this.getTaskFilePath()
  }

  private getTaskFilePath(): string {
    const dir = join(this.agentDir, 'tasks')
    mkdirSync(dir, { recursive: true })
    return join(dir, 'task.json')
  }

  private async persistenceTasks(): Promise<void> {
    const file = Bun.file(this.taskFilePath)
    logger.info(this.tasks, '[task] Persisting tasks')
    await file.write(JSON.stringify(this.tasks, null, 2))
  }

  async loadTasks(): Promise<void> {
    const file = Bun.file(this.taskFilePath)
    if (!(await file.exists())) return
    try {
      const cache: Record<string, Task> = (await file.json()) || {}
      for (const [id, task] of Object.entries(cache)) {
        if (!this.tasks[id]) {
          this.tasks[id] = { ...task, status: 'pending' }
        }
      }
    } catch (error) {
      logger.error({ error }, '[task] Failed to load tasks')
    }
  }

  async addTask(task: Omit<Task, 'status'>): Promise<string> {
    const taskId = `task_${randomUUID()}`
    this.tasks[taskId] = { ...task, status: 'pending' }
    await this.persistenceTasks()
    return taskId
  }

  async delTask(taskId: string): Promise<void> {
    delete this.tasks[taskId]
    await this.persistenceTasks()
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks[taskId]
  }

  getAllTasks(): Record<string, Task> {
    return this.tasks
  }

  private async sendTaskResult(taskId: string, task: Task, content: string): Promise<void> {
    if (!this.channelConfig) return
    const { type, chatId, atUserId } = task.channelConfig
    if (type === 'feishu') {
      await sendFeishuMessage(
        this.channelConfig['app-id'],
        this.channelConfig['app-secret'],
        chatId,
        `> 任务 ${taskId} 执行完毕\n\n${content}`,
        atUserId || '',
      )
    }
  }

  async runAgent(
    taskId: string,
    task: Task,
    buildAgent: () => Promise<EasyAgent>,
  ): Promise<string> {
    const agent = await buildAgent()

    const prompt = task.isReminder
      ? `任务${taskId}执行时间${dayjs().format(this.dateFormat)}到了，这是一个提醒任务，内容如下\n\n${task.content}，请使用 systemtool__result_callback 处理结果`
      : `任务${taskId}执行时间${dayjs().format(this.dateFormat)}到了，这是一个执行任务，内容如下\n\n${task.content}`

    const tool = new DynamicStructuredTool({
      name: 'systemtool__send_task_result_message',
      description: `若需要告知用户结果，请使用此工具回调结果，参数为字符串内容，内容将原样发送给用户
  args:
    - needSendMessageToUser: 是否需要发送消息给用户
    - messageContent: 需要发送给用户的内容`,
      schema: z.object({
        needSendMessageToUser: z.boolean().describe('是否需要发送消息给用户'),
        messageContent: z.string().describe('需要发送给用户的内容').optional(),
      }),
      func: async ({ needSendMessageToUser, messageContent }) => {
        if (needSendMessageToUser && messageContent) {
          await this.sendTaskResult(taskId, task, messageContent)
        }
      },
    })

    const { content } = await agent.invokeSync(prompt, {
      tools: [tool],
    })
    return content
  }

  private scheduleNextRun(taskId: string, task: Task): void {
    if (task.cron) {
      const next = CronExpressionParser.parse(task.cron).next()
      if (next) {
        this.tasks[taskId] = {
          ...task,
          status: 'pending',
          lastRunTime: dayjs().format(this.dateFormat),
          nextRunTime: dayjs(next.toDate()).format(this.dateFormat),
        }
        return
      }
    }
    delete this.tasks[taskId]
  }

  private async executeTask(
    taskId: string,
    task: Task,
    buildAgent: () => Promise<EasyAgent>,
  ): Promise<void> {
    try {
      await this.runAgent(taskId, task, buildAgent)
    } catch (error) {
      logger.error({ error, taskId }, '[task] Error executing task')
    } finally {
      this.scheduleNextRun(taskId, task)
      await this.persistenceTasks()
    }
  }

  start(buildAgent: () => Promise<EasyAgent>): void {
    if (this.heartbeatInterval) return

    this.loadTasks().then(() => {
      this.heartbeatInterval = setInterval(async () => {
        const now = dayjs()
        for (const [taskId, task] of Object.entries(this.tasks)) {
          if (task.status === 'ing') continue

          const nextRunTime = dayjs(task.nextRunTime)
          if (nextRunTime.isAfter(now)) continue

          // Mark as executing
          this.tasks[taskId] = { ...task, status: 'ing' }
          await this.persistenceTasks()

          // Execute asynchronously
          this.executeTask(taskId, this.tasks[taskId], buildAgent)
        }
      }, 30 * 1000)
    })
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  createTools(type: 'feishu', chatId: string, senderUnionId: string): DynamicStructuredTool[] {
    const self = this
    return [
      new DynamicStructuredTool({
        name: 'task-manager__add_task',
        description: 'Add a task. Requires task content, cron expression, nextRunTime.',
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
          const taskId = await self.addTask({
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
          await self.delTask(taskId)
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
          const task = self.getTask(taskId)
          return task ? JSON.stringify(task, null, 2) : `Task not found with ID: ${taskId}`
        },
      }),
      new DynamicStructuredTool({
        name: 'task-manager__get_all_task',
        description: 'Get all tasks.',
        schema: z.object({}),
        func: async () => JSON.stringify(self.getAllTasks(), null, 2),
      }),
    ]
  }
}

export { TaskManager as default }

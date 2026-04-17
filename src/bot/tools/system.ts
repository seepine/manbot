import dayjs from 'dayjs'
import { DynamicStructuredTool } from 'langchain'
import { z } from 'zod'
import systeminformation from 'systeminformation'
import { spawn } from 'node:child_process'
import { httpProxyEnv } from '../utils/env'
import { EnvManager } from '../env-manager.ts'

const systemInnerTools: DynamicStructuredTool[] = [
  new DynamicStructuredTool({
    name: 'systemtools__get_current_datetime',
    description: 'Get the current datetime.',
    schema: z.object({}),
    func: async () => {
      const currentDate = dayjs().format('YYYY-MM-DD HH:mm:ss')
      return `Current datetime is: ${currentDate}`
    },
  }),
]

const getSysteminfoOutputSchema = z.object({
  osInfo: z
    .object({
      platform: z.string().describe('os platform').optional(),
      distro: z.string().describe('os distro').optional(),
      codename: z.string().describe('os codename').optional(),
      release: z.string().describe('os release').optional(),
      arch: z.string().describe('os arch').optional(),
      hostname: z.string().describe('os hostname').optional(),
    })
    .optional(),
  cpu: z
    .object({
      speed: z.number().describe('cpu speed').optional(),
      cores: z.number().describe('cpu cores').optional(),
      manufacturer: z.string().describe('cpu manufacturer').optional(),
      brand: z.string().describe('cpu brand').optional(),
      currentLoad: z.string().describe('cpu current load, like 10.0%').optional(),
    })
    .optional(),
  mem: z
    .object({
      total: z.number().describe('mem total').optional(),
      free: z.number().describe('mem free').optional(),
      used: z.number().describe('mem used').optional(),
      active: z.number().describe('mem active').optional(),
      available: z.number().describe('mem available').optional(),
      buffers: z.number().describe('mem buffers').optional(),
      cached: z.number().describe('mem cached').optional(),
    })
    .optional(),
})

export const createSystemTools = (workspace: string, agentDir: string) => {
  const envManager = new EnvManager(agentDir)
  return [
    ...systemInnerTools,
    new DynamicStructuredTool({
      name: 'systemtools__get_systeminfo',
      description: 'Get system info, about osInfo, cpuInfo and memInfo.',
      schema: z.object({
        fields: z
          .array(z.enum(['os', 'memory', 'cpu']))
          .describe('fields to get, default is all')
          .optional(),
      }),
      func: async ({ fields = ['os', 'memory', 'cpu'] }) => {
        // 获取系统信息
        const systemInfo: z.infer<typeof getSysteminfoOutputSchema> = {}
        const task: (() => Promise<void>)[] = []
        if (fields.includes('os')) {
          task.push(async () => {
            systemInfo.osInfo = {
              ...(await systeminformation.osInfo()),
            }
          })
        }
        // 获取内存信息
        if (fields.includes('memory')) {
          task.push(async () => {
            systemInfo.mem = {
              ...(await systeminformation.mem()),
            }
          })
        }
        // 获取cpu信息
        if (fields.includes('cpu')) {
          task.push(async () => {
            systemInfo.cpu = {
              ...(await systeminformation.cpu()),
              currentLoad: (await systeminformation.currentLoad()).currentLoad.toFixed(2) + '%',
            }
          })
        }
        await Promise.all(task.map((t) => t()))
        const result = getSysteminfoOutputSchema.parse(systemInfo)
        return {
          isSuccess: true,
          result,
        }
      },
    }),

    new DynamicStructuredTool({
      name: 'systemtools__add_env',
      description: 'Add or update one persisted environment variable.',
      schema: z.object({
        name: z.string().describe('env key, like API_KEY'),
        value: z.string().describe('env value'),
      }),
      func: async ({ name, value }) => {
        if (!name.trim()) {
          return {
            isError: true,
            error: 'env name cannot be empty',
          }
        }
        await envManager.addEnv(name, value)
        return {
          isSuccess: true,
          result: `env "${name}" saved`,
        }
      },
    }),

    new DynamicStructuredTool({
      name: 'systemtools__del_env',
      description: 'Delete one persisted environment variable.',
      schema: z.object({
        name: z.string().describe('env key to delete'),
      }),
      func: async ({ name }) => {
        if (!name.trim()) {
          return {
            isError: true,
            error: 'env name cannot be empty',
          }
        }
        const ok = await envManager.delEnv(name)
        if (!ok) {
          return {
            isError: true,
            error: `env "${name}" not found`,
          }
        }
        return {
          isSuccess: true,
          result: `env "${name}" deleted`,
        }
      },
    }),

    new DynamicStructuredTool({
      name: 'systemtools__list_env',
      description: 'List all persisted environment variables.',
      schema: z.object({}),
      func: async () => {
        const envs = await envManager.getAllEnvs()
        return {
          isSuccess: true,
          result: JSON.stringify(envs, null, 2),
        }
      },
    }),

    new DynamicStructuredTool({
      name: 'systemtools__exec_command',
      description: 'Execute a shell command.',
      schema: z.object({
        command: z.string().describe('command to exec, like cd/pwd/ls'),
        args: z.array(z.string()).describe('args to exec').optional(),
        // cwd: z.string().describe('exec command in this directory').optional(),
        timeout: z.number().describe('timeout in ms, default is 0').optional(),
        env: z.record(z.string(), z.string()).describe('env to exec').optional(),
      }),
      func: async ({ command, args, timeout, env }) => {
        if (command.includes('rm') || command.includes('del') || command.includes('rmdir')) {
          return {
            isError: true,
            content: `[warning] command "${command}" is not allowed to execute, because it may be dangerous, operate file please use file tools.`,
          }
        }
        if (command.includes(' ')) {
          return {
            isError: true,
            content: `[warning] command "${command}" cannot contain space, please split command and args correctly.`,
          }
        }
        const persistedEnv = await envManager.getAllEnvs()
        const func = new Promise<string>((resolve, reject) => {
          const ls = spawn(command, args, {
            timeout,
            cwd: workspace,
            shell: true,
            env: { ...process.env, ...httpProxyEnv, ...persistedEnv, ...env },
          })
          let text = ''
          ls.stdout.on('data', (data) => {
            text += `${data}`
          })
          ls.stderr.on('data', (data) => {
            text += `${data}`
          })
          ls.on('error', (error) => {
            text += `[error]\n${error}`
          })
          ls.on('close', (code) => {
            if (code === 0) {
              resolve(text)
            } else {
              reject(`${text}\n[exit_code]: ${code}`)
            }
          })
        })
        try {
          const text = await func
          return {
            isSuccess: true,
            result: text,
          }
        } catch (error) {
          return {
            isError: true,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      },
    }),
  ]
}

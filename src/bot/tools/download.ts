import { DynamicStructuredTool } from 'langchain'
import { z } from 'zod'
import { join } from 'path'
import { MD5 } from 'bun'
import axios from 'axios'
import dayjs from 'dayjs'
import { mkdir } from 'fs/promises'
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export const getFileMeta = (workspaceFolder: string, path: string, filename: string) => {
  if (path.startsWith(workspaceFolder)) {
    path = path.slice(workspaceFolder.length)
  }
  const dirPath = join(workspaceFolder, path)
  const filePath = join(dirPath, filename)
  const statusFilePath = join(
    workspaceFolder,
    '.cache',
    'downloads',
    `${MD5.hash(filePath, 'hex')}.status.json`,
  )
  return {
    dirPath,
    statusFilePath,
    filePath,
  }
}
type statusResult = {
  /**
   * 下载状态
   */
  status: 'downloading' | 'success' | 'failed' | 'unkonwn'
  /**
   * 下载URL
   */
  url: string
  /**
   * 错误信息
   */
  error: string
  /**
   * 文件名
   */
  filename: string
  /**
   * 下载路径
   */
  path: string
  /**
   * 下载总大小（字节）
   */
  totalSize: number
  /**
   * 已下载大小（字节）
   */
  loadedSize: number
  /**
   * 下载进度（100%）
   */
  progress: string
  /**
   * 估计完成时间（秒）
   * @example '10 秒'
   */
  estimatedTime: string
  /**
   * 下载速度（字节/秒）
   * @example '1024 KB/s'
   */
  rate: string
  /**
   * 上次更新时间
   */
  lastUpdateTime: string
}
export const handleDownload = async (
  workspaceFolder: string,
  params: z.infer<typeof downloadFileSchema>,
) => {
  const { url, filename, path } = params
  const meta = getFileMeta(workspaceFolder, path, filename)
  const { dirPath, statusFilePath, filePath } = meta
  let statusResult: statusResult = {
    status: 'downloading',
    url,
    error: '',
    filename: filename,
    path: filePath,
    totalSize: 0,
    loadedSize: 0,
    progress: '0%',
    estimatedTime: '-',
    rate: '0 KB/s',
    lastUpdateTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
  }

  const persistenceStatusFile = async () => {
    const file = Bun.file(statusFilePath)
    statusResult.lastUpdateTime = dayjs().format('YYYY-MM-DD HH:mm:ss')
    await file.write(JSON.stringify(statusResult, null, 2))
  }

  const timer = setInterval(async () => {
    await persistenceStatusFile()
  }, 1000)

  await axios
    .request({
      url,
      method: 'GET',
      responseType: 'stream',
      adapter: 'fetch',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        Range: 'bytes=0-',
        'Accept-Ranges': 'bytes',
        Accept: '*/*',
      },
      timeout: 0,
      onDownloadProgress: (progressEvent) => {
        statusResult.loadedSize = Number(progressEvent.loaded || 0)
        statusResult.totalSize = Number(progressEvent.total || 0)
        statusResult.progress =
          progressEvent.progress !== undefined
            ? `${(progressEvent.progress * 100).toFixed(2)}%`
            : '-%'
        statusResult.estimatedTime =
          progressEvent.estimated !== undefined
            ? `${parseInt(progressEvent.estimated.toFixed(0))} 秒`
            : '-'
        statusResult.rate =
          progressEvent.rate !== undefined
            ? `${(progressEvent.rate / 1024).toFixed(2)} KB/s`
            : '- KB/s'
      },
    })
    .then(async (resp) => {
      await mkdir(dirPath, { recursive: true })
      console.log('下载路径', filePath)
      const file = Bun.file(filePath)
      if (await file.exists()) {
        await file.delete()
      }
      const writer = file.writer({ highWaterMark: 1024 * 1024 })
      const data: ReadableStream<any> = resp.data
      const reader = data.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        writer.write(value)
      }
      await writer.end()
      statusResult.status = 'success'
    })
    .catch((error) => {
      console.error('Download failed:', error)
      statusResult.status = 'failed'
      statusResult.error = error.message
      return `create download task failed: ${url} -> ${filePath}`
    })
    .finally(async () => {
      clearInterval(timer)
      if (statusResult.status === 'downloading') {
        statusResult.status = 'unkonwn'
        statusResult.error = 'unknown error, please download again'
      }
      await persistenceStatusFile()
    })
  return meta
}
export const downloadFileSchema = z.object({
  url: z.string().describe('The URL of the file to download'),
  filename: z.string().describe('The name of the file to save as'),
  path: z.string().describe('The directory path where the file will be saved'),
  userAgent: z
    .string()
    .describe('The User-Agent header to use for the download request')
    .optional(),
})

/**
 * 创建下载工具
 * @param workspaceFolder 工作空间文件夹路径
 * @returns 下载工具数组
 */
export const createDownloadTools = (workspaceFolder: string) => {
  return [
    new DynamicStructuredTool({
      name: 'systemtools__download_file',
      description: 'Download a file from a URL to a specific path and track progress.',
      schema: downloadFileSchema,
      func: async (params) => {
        await handleDownload(workspaceFolder, params)
        return `start download file: ${params.url} -> ${join(params.path, params.filename)}`
      },
    }),
    new DynamicStructuredTool({
      name: 'systemtools__query_download_status',
      description: 'Query the download status of a file.',
      schema: z.object({
        path: z.string().describe('The directory path where the file is saved'),
        filename: z.string().describe('The name of the file'),
      }),
      func: async ({ filename, path }) => {
        const { statusFilePath } = getFileMeta(workspaceFolder, path, filename)
        const file = Bun.file(statusFilePath)
        if (!(await file.exists())) {
          return {
            status: 'error',
            error: `未找到 ${join(path, filename)} 下载记录.`,
          }
        }
        try {
          const content: statusResult = await file.json()
          if (content.status === 'downloading') {
            if (dayjs().diff(dayjs(content.lastUpdateTime), 'second') > 30) {
              content.status = 'failed'
              content.error = 'download timeout, please download again'
            }
          }
          return JSON.stringify(content)
        } catch (error) {
          return JSON.stringify({
            status: 'error',
            error: 'Failed to read status file',
          })
        }
      },
    }),
  ]
}

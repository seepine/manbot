// 创建 bun test 测试下载工具
import { test, expect } from 'bun:test'
import { handleDownload } from './download'
import { logger } from '../../log.ts'

test('downloadFile', async () => {
  const workspaceFolder = './.data/workspace'
  const url =
    'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz'
  const filename = 'ffmpeg-master-latest-linux64-gpl.tar.xz'
  const path = './bin'

  const meta = await handleDownload(workspaceFolder, {
    url,
    filename,
    path,
  })
  expect(meta.filePath).not.toBe('')
  logger.info(meta)
}, 0)

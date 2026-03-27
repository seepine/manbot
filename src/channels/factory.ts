import { join } from 'node:path'
import type { ChannelConfig } from '../config/types.ts'
import type { Channel } from './channel.ts'
import { FeishuChannel } from './feishu.ts'

export function createChannel(workspace: string, name: string, config: ChannelConfig): Channel {
  if (config.type === 'feishu') {
    config['app-name'] = config['app-name'] || name
    return new FeishuChannel(join(workspace, 'downloads', 'feishu'), config)
  }
  throw new Error(`Unsupported channel type: ${config.type}`)
}

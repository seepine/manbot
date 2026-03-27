import { pino } from 'pino'
import { PinoPretty } from 'pino-pretty'

const isDev = process.env['NODE_ENV'] !== 'production' && process.env['MODE'] !== 'production'

export const logger = pino(
  {
    level: process.env['LOG_LEVEL'] || (isDev ? 'debug' : 'info'),
  },
  PinoPretty({
    sync: isDev,
    colorize: true,
    singleLine: true,
    levelFirst: true,
    translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
    ignore: 'pid,hostname',
  }),
)

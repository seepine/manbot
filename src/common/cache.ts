import { Cache } from '@seepine/cache'
import { BunRedisAdapter } from '@seepine/cache/adapt/bun'

const redisUrl = process.env.REDIS_URL
export const cache = new Cache({
  adapter: redisUrl ? new BunRedisAdapter(redisUrl) : undefined,
})

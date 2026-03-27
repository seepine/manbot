import { Elysia } from 'elysia'
import { loadConfig } from './config/loader.ts'
import { Agent } from './bot/agent.ts'
import { logger } from './log.ts'

let agents: Agent[] = []
const loadAgent = async () => {
  agents = []
  const config = await loadConfig()
  const agentNames = Object.keys(config.agents)
  for (const [agentName, agentConfig] of Object.entries(config.agents)) {
    const provider = config.providers[agentConfig.provider.name]
    if (!provider) {
      throw new Error(`agent [${agentName}] 的provider.name不存在`)
    }
    const agent = new Agent({
      name: agentName,
      provider: provider,
      config: agentConfig,
      otherAgents: agentNames.filter((item) => item !== agentName),
    })
    agents.push(agent)
  }
  await Promise.all(agents.map((agent) => agent.start()))
  logger.info(`manbot 启动成功，共 ${agents.length} 个 agent`)
}

new Elysia({
  serve: {
    idleTimeout: 60,
  },
})
  .get('/restart', async () => {
    await Promise.all(agents.map((agent) => agent.stop()))
    await loadAgent()
    return 'ok'
  })
  .onStart(async () => {
    try {
      await loadAgent()
    } catch (e) {
      logger.error(e, 'app start error')
    }
  })
  .onStop(async () => {
    try {
      await Promise.all(agents.map((agent) => agent.stop()))
    } catch (e) {
      logger.error(e, 'app stop error')
    }
  })
  .listen(process.env.PORT || 3000)

import { Elysia } from 'elysia'
import { loadConfig } from './config/loader.ts'
import { Agent } from './bot/agent.ts'
import { createChannel } from './channels/channel.ts'

const config = loadConfig()

const agents: Agent[] = []

for (const [agentName, agentConfig] of Object.entries(config.agents)) {
  const mergedConfig = {
    ...config.provider,
    ...agentConfig.provider,
  }
  const workspace = agentConfig['workspace-dir'] || `workspace-${agentName}`
  const channel = createChannel(agentConfig.channel)

  const agent = new Agent({
    name: agentName,
    config: mergedConfig,
    workspace,
    channel,
    channelConfig: agentConfig.channel,
  })

  agents.push(agent)
}

const app = new Elysia().onStart(async () => {
  for (const agent of agents) {
    await agent.start()
  }
  console.log(`manbot 启动成功，共 ${agents.length} 个 agent`)
}).listen(process.env.PORT || 45927)
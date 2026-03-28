import { join } from 'node:path'
import defaultPrompt from './assets/prompt-default.txt' with { type: 'txt', embed: 'true' }
import memoryPrompt from './assets/memory-default.txt' with { type: 'txt', embed: 'true' }
import AGENTS from './assets/init/AGENTS.txt' with { type: 'txt', embed: 'true' }
import BOOTSTRAP from './assets/init/BOOTSTRAP.txt' with { type: 'txt', embed: 'true' }
import IDENTITY from './assets/init/IDENTITY.txt' with { type: 'txt', embed: 'true' }
import SOUL from './assets/init/SOUL.txt' with { type: 'txt', embed: 'true' }
import TOOLS from './assets/init/TOOLS.txt' with { type: 'txt', embed: 'true' }
import USER from './assets/init/USER.txt' with { type: 'txt', embed: 'true' }

export const loadPromptTools = async (workspace: string): Promise<string> => {
  const agentsFile = Bun.file(join(workspace, 'AGENTS.md'))
  if (!(await agentsFile.exists())) {
    await agentsFile.write(AGENTS)
    await Bun.file(join(workspace, 'BOOTSTRAP.md')).write(BOOTSTRAP)
    await Bun.file(join(workspace, 'IDENTITY.md')).write(IDENTITY)
    await Bun.file(join(workspace, 'SOUL.md')).write(SOUL)
    await Bun.file(join(workspace, 'TOOLS.md')).write(TOOLS)
    await Bun.file(join(workspace, 'USER.md')).write(USER)
  }
  const content = await agentsFile.text()
  if (content.trim().length > 0) {
    return content + `\n\n` + defaultPrompt
  }
  return AGENTS + `\n\n` + defaultPrompt
}

export const loadMemoryPrompt = async (workspace: string): Promise<string> => {
  const file = Bun.file(join(workspace, 'MEMORY_PROMPT.md'))
  if (!(await file.exists())) {
    await file.write(memoryPrompt)
  }
  const content = await file.text()
  if (content.trim().length > 0) {
    return content
  }
  return memoryPrompt
}

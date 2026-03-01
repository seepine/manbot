import { join } from 'node:path'
import defaultPrompt from './assets/prompt-default.txt' with { type: 'txt', embed: 'true' }
import AGENTS from './assets/AGENTS.txt' with { type: 'txt', embed: 'true' }

export const loadPromptTools = async (workspace: string): Promise<string> => {
  const agentsFile = Bun.file(join(workspace, 'AGENTS.md'))
  if (!(await agentsFile.exists())) {
    await agentsFile.write(AGENTS)
  }
  const content = await agentsFile.text()
  if (content.trim().length > 0) {
    return content + `\n\n` + defaultPrompt
  }
  return AGENTS + `\n\n` + defaultPrompt
}

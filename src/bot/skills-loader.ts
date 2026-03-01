import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

interface Skill {
  name: string
  description: string
  content: string
}

/**
 * 从 .agents/skills 目录中读取所有 skill
 * 每个 skill 是一个子目录，包含一个 SKILL.md 文件
 */
export const loadSkills = async (workspace: string): Promise<Skill[]> => {
  const skillsDir = join(workspace, '.agents/skills')

  try {
    const entries = await readdir(skillsDir, { withFileTypes: true })
    const skills: Skill[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillFile = Bun.file(join(skillsDir, entry.name, 'SKILL.md'))
      if (!(await skillFile.exists())) continue
      const content = await skillFile.text()
      const metaStartIdx = content.indexOf(`---`) + 3
      const metaEndIdx = content.indexOf(`---`, metaStartIdx)
      if (metaEndIdx <= metaStartIdx || metaEndIdx < 1) {
        continue
      }
      const description = content.substring(metaStartIdx, metaEndIdx).trim()
      if (description.length > 0) {
        skills.push({ name: entry.name, content, description })
      }
    }
    return skills
  } catch {
    return []
  }
}

/**
 * 将 skills 合并为系统提示词的一部分
 */
export const buildSkillsPrompt = (skills: Skill[]): string => {
  if (skills.length === 0) return ''
  const parts = skills.map(
    (skill) => `<skill name="${skill.name}">\n${skill.description}\n</skill>`,
  )
  const prompt = `\n\n以下是你可用的 Skills（领域知识）:\n<skills>\n${parts.join('\n\n')}\n</skills>`
  return prompt
}

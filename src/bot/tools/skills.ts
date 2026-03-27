import { DynamicStructuredTool } from 'langchain'
import { z } from 'zod'
import { join } from 'node:path'
import HOW_TO_CREATE_SKILL from '../assets/how-to-create-skill.txt' with {
  type: 'txt',
  embed: 'true',
}
import HOW_TO_INSTALL_SKILL from '../assets/how-to-install-skill.txt' with {
  type: 'txt',
  embed: 'true',
}
import { readdir, access, constants } from 'node:fs/promises'
import { mkdir } from 'node:fs/promises'

export interface Skill {
  name: string
  meta: string
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
      const meta = content.substring(metaStartIdx, metaEndIdx).trim()
      if (meta.length > 0) {
        skills.push({ name: entry.name, meta })
      }
    }
    return skills
  } catch {
    return []
  }
}

export const loadSkill = async (workspace: string, name: string) => {
  const skillsDir = join(workspace, '.agents/skills')
  const skillFile = Bun.file(join(skillsDir, name, 'SKILL.md'))
  if (!(await skillFile.exists())) {
    return ''
  }
  return await skillFile.text()
}

export const initDir = async (workspace: string) => {
  const skillsDir = join(workspace, '.agents/skills')
  try {
    await access(skillsDir, constants.F_OK)
  } catch {
    await mkdir(skillsDir, { recursive: true })
  }
}

export const loadSkillPrompt = async (workspace: string) => {
  // 设置 disable-model-invocation 为 true 可防止代理自动加载此技能
  const skills = (await loadSkills(workspace)).filter(
    (item) => !item.meta.includes('disable-model-invocation: true'),
  )
  return (
    `## 可用技能如下\n` +
    skills
      .map((item) => {
        return `- name: ${item.name}\n  \`\`\`yaml\n${item.meta}\n\`\`\``
      })
      .join('\n\n') +
    `\n`
  )
}

export const createSkillsTools = (workspace: string) => {
  return [
    new DynamicStructuredTool({
      name: 'skills__get_list',
      description:
        'List all available skills. Use this to find skills relevant to the user request.',
      schema: z.object({}),
      func: async () => {
        const skills = await loadSkills(workspace)
        if (skills.length === 0) {
          return 'No skills installed yet.'
        }
        return (
          'Available skills:\n' +
          skills.map((s) => `- ${s.name}: \n  \`\`\`\n${s.meta}\n\`\`\``).join('\n')
        )
      },
    }),

    new DynamicStructuredTool({
      name: 'skills__get_SKILL.md_by_name',
      description:
        "Read a skill's full content including metadata (description) and instructions (SKILL.md). Always read the skill content before applying it to understand how to use it correctly.",
      schema: z.object({
        name: z.string().describe('The skill name to retrieve'),
      }),
      func: async ({ name }) => {
        const skill = await loadSkill(workspace, name)
        if (!skill) {
          return `Skill "${name}" not found. Use skills__get_list to see available skills.`
        }
        return skill
      },
    }),

    new DynamicStructuredTool({
      name: 'skills__how_to_create_skill',
      description:
        '当用户要求创建、编写或扩展 skill 时，**必须先调用此工具**获取创建指南。不可跳过此步骤直接编写 SKILL.md。',
      schema: z.object({}),
      func: async () => HOW_TO_CREATE_SKILL,
    }),

    new DynamicStructuredTool({
      name: 'skills__install_helper',
      description:
        '当用户要求安装 skill 时，**必须先调用此工具**获取安装指南。不可跳过此步骤直接执行安装命令。',
      schema: z.object({}),
      func: async () => {
        await initDir(workspace)
        return HOW_TO_INSTALL_SKILL
      },
    }),
  ]
}

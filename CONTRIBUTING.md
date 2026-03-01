# 为 Manbot 做贡献

感谢您有兴趣为 Manbot 做贡献！本文档提供了开发、从源码构建以及为项目做贡献的指南。

## 开发设置

### 先决条件

- [Bun](https://bun.sh) (v1.0.0 或更高版本)
- 一个飞书（Lark）开放平台账号和应用（用于测试集成）。
- Docker（可选，用于容器化测试）。

### 本地开发

1. **克隆仓库：**

   ```bash
   git clone https://github.com/seepine/manbot.git
   cd manbot
   ```

2. **安装依赖：**

   ```bash
   bun install
   ```

3. **配置：**
   将 `.env.example` 复制为 `.env` 并配置必要的环境变量。

   ```bash
   cp .env.example .env
   ```

4. **启动开发服务器：**
   使用热重载启动服务器：
   ```bash
   bun dev
   ```
   此命令运行 `bun run --inspect=/bun src/index.ts`，启用调试器和热模块替换。

## 项目结构

- `src/index.ts`：应用程序入口点，初始化 Elysia 服务器和飞书集成。
- `src/bot/`：核心机器人逻辑。
  - `bot.ts`：使用 LangChain 构建 Agent 和消息处理逻辑。
  - `mcp-loader.ts`：处理加载和初始化 Model Context Protocol (MCP) 工具。
  - `skills-loader.ts`：扫描并加载工作区目录中的技能。
  - `prompt-loader.ts`：加载系统提示词和 Agent 人设。
- `src/channels/`：渠道实现。
  - `feishu.ts`：飞书（Lark）特定的集成代码。
- `AGENTS.md`：默认 Agent 人设和系统提示词模板。

## 代码风格

本项目使用 [Prettier](https://prettier.io/) 进行代码格式化。请在提交 Pull Request 之前确保您的代码已格式化。

```bash
bun run format
```

## 提交更改

1. Fork 本仓库。
2. 为您的功能或 bug 修复创建一个新分支。
3. 进行更改并提交带有描述性信息的 commit。
4. 将更改推送到您的 Fork。
5. 向主仓库提交 Pull Request。

# 项目开发规范

## 项目背景

本项目是一个现代 AI Agent 架构的演示：

- **运行时**: [Bun](https://bun.sh) (极速、全能工具包)。
- **Web 框架**: [Elysia](https://elysiajs.com) (Bun 的灵巧 Web 框架)。
- **AI 逻辑**: [LangChain.js](https://js.langchain.com) (LLM 链式调用)。
- **集成**: 飞书/Lark 开放平台 (聊天接口)。
- **协议**: Model Context Protocol (MCP) 用于工具标准化。

### 关键目录结构

- `src/index.ts`: 应用入口点，启动 Elysia 服务器和飞书机器人。
- `src/bot/`: 核心逻辑。
  - `agent.ts`: Agent 的构建和消息处理逻辑。
  - `mcp-loader.ts`: 加载 MCP 工具。
  - `prompt-loader.ts`: 加载 prompt 模板。
  - `task-manager.ts`: 管理定时任务。
  - `tool-registry.ts`: MCP 工具注册表。
  - `tools/`: 工具实现。
    - `skills.ts`: 技能加载。
    - `mcp.ts`: MCP 内部工具。
    - `download.ts`: 下载工具。
    - `system.ts`: 系统内置工具。
    - `sub-agent.ts`: 子 agent 工具。
- `src/channels/`: 沟通的适配器（目前是飞书）。

## 编码指南

当为本项目编写或分析代码时，请遵循以下原则：

1.  **优先使用 Bun API**: 尽量使用 `Bun.file()`, `Bun.write()`, `Bun.serve()` 等原生 API，以获得最佳性能。
2.  **TypeScript 优先**: 确保代码类型安全。为所有数据结构定义清晰的 Interface（参考 `task-manager.ts` 中的 `Task` 接口）。
3.  **模块化设计**: 保持函数小而专注，遵循单一职责原则。
4.  **异步处理**: 使用现代的 async/await 模式处理 IO 操作。
5.  **错误处理**: 总是优雅地处理错误，确保机器人不会因为未捕获的异常而崩溃。

### 命令

- `bun run dev`: 启动开发服务。
- `bun run tsc`: 对 TypeScript 代码进行类型检查。
- `bun run format`: 对代码进行格式化。
- `bun run build`: 编译二进制文件 `app` 到 `dist` 目录。
- `bun run build -j`: 编译 js 文件到 `dist` 目录。

## 记住

每次新增或修改代码，应按照以下步骤进行：

- 使用 code-simplifier skill 对代码进行简化。
- 使用 `bun run tsc` 对代码进行类型检查，确保符合项目的类型规范。
- 使用 `bun run format` 对代码进行格式化，确保符合项目的代码规范。

# Manbot - 曼波助手

简体中文 | [English](./README.en.md)

Manbot 是一个轻量化的智能助手，核心代码只有200行左右，通过集成 LLM + MCP + Skills，将 AI 直接融入你的飞书中。

> 项目较新，不排除之后有破坏性更新，请部署时锁定版本号，并在升级时注意更新指南

> 项目未在windows下进行测试，欢迎在windows下部署并反馈问题

该项目基于 [Bun](https://bun.sh)、[Elysia](https://elysiajs.com) 和 [LangChain](https://js.langchain.com/) 构建，支持模型上下文协议（MCP）和技能（Skills）加载，具有高度的可扩展性，能够适应各种任务需求。

- **MCP 支持**：利用模型上下文协议（MCP）通过外部工具扩展能力。
- **Skill 支持**：从工作区加载自定义技能，增强机器人的知识和能力。
- **任务管理**：支持添加、检查和执行定时任务。
- **灵活配置**：轻松配置 LLM 提供商（兼容 OpenAI 接口）和环境设置。
- **飞书集成**：通过飞书聊天无缝与机器人进行交互。

## 快速部署

推荐使用 Docker Compose 进行快速部署，或者下载 [二进制文件](https://github.com/seepine/manbot/releases) 直接运行。

### 1. 复制 docker-compose.example.yml 内容

```bash
cp docker-compose.example.yml docker-compose.yml
```

### 2. 配置环境变量

编辑 `docker-compose.yml` 文件，配置环境变量。

### 3. 启动服务

```bash
docker-compose up -d
```

服务启动后，Manbot 将在后台运行并监听飞书消息。

## npm 国内源

bunx/uv 的国内源配置请查看 [registry.md](./docs/registry.md)

## 环境变量配置

> 若以二进制文件运行，在二进制同目录下创建 `.env` 文件，配置环境变量。

| 变量名                | 描述                                      | 默认值                        |
| --------------------- | ----------------------------------------- | ----------------------------- |
| `WORKSPACE_FOLDER`    | 机器人工作目录，存放技能、MCP 配置和记忆  |                               |
| `OPENAI_API_KEY`      | OpenAI 或兼容接口的 API Key               | -                             |
| `OPENAI_BASE_URL`     | LLM API 基础地址                          | -                             |
| `OPENAI_MODEL`        | 使用的模型名称                            | `gpt-4o`                      |
| `ANTHROPIC_AUTH_TOKEN` | Anthropic API Key（设置后优先使用）      | -                             |
| `ANTHROPIC_BASE_URL`  | Anthropic API 基础地址                    | `https://api.anthropic.com`   |
| `ANTHROPIC_MODEL`     | Anthropic 模型名称                        | `claude-3-5-sonnet-20241022`  |
| `FEISHU_APP_ID`       | 飞书应用 ID                               | -                             |
| `FEISHU_APP_SECRET`   | 飞书应用 Secret                           | -                             |
| `FEISHU_APP_NAME`     | 飞书应用名称，用于在群组中判断是否@该应用 | `Manbot`                      |
| `TAVILY_API_KEY`      | Tavily API Key，用于 Tavily 搜索服务      | -                             |
| `TERMINAL_ENABLED`    | 是否启用终端，启用后可以直接执行命令      | `false`                       |
| `SHOW_THINKING`       | 是否显示思考内容（仅适用于 Anthropic 模型）| `false`                       |

## 消息通道配置

### 飞书（Lark）

Manbot 支持通过飞书（Lark）聊天与用户交互。在配置环境变量时，需要提供飞书应用的 `App ID`、`App Secret` 和 `App Name`。
详细配置请参考 [飞书（Lark）集成](./docs/feishu.md)。

## 使用指南

### Skills 配置

直接告诉 Manbot 你要添加的技能，它会自动添加并自动加载使用。

### MCP 配置

直接告诉 Manbot 你要添加的 MCP，它会自动添加并自动加载使用。

若MCP需要用到工作目录，可以在 MCP 配置中使用 `${workspaceFolder}` 值，它会被替换成实际的工作目录路径。

例如以下配置

```json
{
  "mcpServers": {
    "mcp-terminal": {
      "type": "stdio",
      "command": "bunx",
      "args": ["-y", "@seepine/mcp-terminal"],
      "env": {
        "DEFAULT_CWD": "${workspaceFolder}"
      }
    }
  }
}
```

### 任务配置

直接告诉 Manbot 你要添加的任务，或者聊天中提到例如 `十分钟之后提醒我开会`，它会自动添加任务并按时执行。

### 自定义提示词

直接告诉 Manbot 修改 `AGENTS.md` 为你想要的内容，它会自动加载使用。

## 许可证

本项目采用 [GPL-3.0](./LICENSE) 协议开源。

- **个人/开源使用**：在符合 GPL-3.0 协议的前提下（包括开源您的衍生代码），您可以免费使用。
- **商业/闭源使用**：如果您希望将本项目用于商业产品且不希望公开您的源代码，请联系作者获取商业授权。

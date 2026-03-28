# Manbot - 曼波助手

简体中文 | [English](./README.en.md)

Manbot 是一个轻量化的智能助手，核心代码只有200行左右，通过集成 LLM + MCP + Skills，将 AI 直接融入你的飞书中。

> 项目较新，不排除之后有破坏性更新，请部署时锁定版本号，并在升级时注意更新指南

> 项目未在windows下进行测试，欢迎在windows下部署并反馈问题

该项目基于 [Bun](https://bun.sh)、[Elysia](https://elysiajs.com) 和 [LangChain](https://js.langchain.com/) 构建，支持模型上下文协议（MCP）和技能（Skills）加载，具有高度的可扩展性，能够适应各种任务需求。

- **MCP 支持**：利用模型上下文协议（MCP）通过外部工具扩展能力。
- **Skill 支持**：从工作区加载自定义技能，增强机器人的知识和能力。
- **Hook 系统**：支持在代理生命周期的不同阶段插入自定义逻辑（创建前、调用前、调用块前、调用后）。
- **任务管理**：支持添加、检查和执行定时任务。
- **灵活配置**：轻松配置 LLM 提供商（兼容 OpenAI 接口）和环境设置。
- **飞书集成**：通过飞书聊天无缝与机器人进行交互。

## 快速部署

推荐使用 Docker Compose 进行快速部署，或者下载 [二进制文件](https://github.com/seepine/manbot/releases) 直接运行。

### 1. 复制配置文件

```bash
# 复制 docker yml
cp docker-compose.example.yml docker-compose.yml
# 创建数据目录
mkdir manbot_data && chown -R 1200:1200 manbot_data
# 复制配置文件
cp config.example.yml ./manbot_data/config.yml
```

### 2. 配置 config.yml

编辑 `config.yml` 文件，配置提供商和 agent 信息。详细配置请参考 [配置说明](./docs/config.md)。

### 3. 启动服务

```bash
docker-compose up -d
```

服务启动后，Manbot 将在后台运行并监听飞书消息。

## npm 国内源

bunx/uv 的国内源配置请查看 [registry.md](./docs/registry.md)

## 配置文件

配置文件采用 `config.yml` 格式，支持多 agent 并行运行。详细配置说明请参考 [配置文档](./docs/config.md)。

## 消息通道配置

### 飞书（Lark）

Manbot 支持通过飞书（Lark）聊天与用户交互。在 `config.yml` 中配置飞书应用的 `app-id`、`app-secret` 和 `app-name`。
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

### Hook 配置

Hook 系统允许你在代理生命周期的不同阶段插入自定义逻辑。通过实现 `AgentHook` 接口，可以：

- `onCreateAgentBefore`：在创建代理之前执行，可修改代理选项
- `onInvokeBefore`：在调用代理之前执行，可修改输入消息
- `onInvokeChunkBefore`：在调用代理的块之前执行，可修改块内容
- `onInvokeAfter`：在调用代理之后执行，可处理输出消息

### 主动记忆整理

每次对话结束后，Manbot 会自动调用子代理整理本次对话内容，主动将重要信息写入记忆文件：

- **每日笔记**（`memory/YYYY-MM-DD.md`）：记录当天的重要任务、进展、问题、用户反馈等原始日志
- **持久记忆**（`MEMORY.md`）：提炼长期有效的信息，如用户偏好、核心决策、技术方案、经验教训

整理规则：

- 高频出现的信息（3次以上）→ 写入持久记忆
- 容易遗忘会导致工作中断的信息 → 写入持久记忆
- 跨会话有效的上下文信息 → 写入持久记忆
- 临时状态或一次性发现 → 仅写入每日笔记

### 任务配置

直接告诉 Manbot 你要添加的任务，或者聊天中提到例如 `十分钟之后提醒我开会`，它会自动添加任务并按时执行。

### 自定义提示词

直接告诉 Manbot 修改 `AGENTS.md` 为你想要的内容，它会自动加载使用。

## 许可证

本项目采用 [GPL-3.0](./LICENSE) 协议开源。

- **个人/开源使用**：在符合 GPL-3.0 协议的前提下（包括开源您的衍生代码），您可以免费使用。
- **商业/闭源使用**：如果您希望将本项目用于商业产品且不希望公开您的源代码，请联系作者获取商业授权。

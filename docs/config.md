# 配置文件说明

Manbot 使用 `config.yml` 配置文件，支持多 agent 同时运行。

## 完整配置示例

```yaml
# 提供商配置
providers:
  my-provider:
    type: openai # 或 anthropic
    base-url: https://api.openai.com/v1
    api-key: OPENAI_API_KEY

    # 以下可选
    timeout: 120000 # 可选
    temperature: 0.7 # 可选
    top-p: 0.9 # 可选
    recursion-limit: 100 # 可选
    auto-tool-discovery: false # 可选
    show-thinking-message: false # 可选，是否显示思考信息
    show-tool-message: false # 可选，是否显示工具信息

  anthropic-provider:
    type: anthropic
    api-key: ANTHROPIC_API_KEY

agents:
  main:
    workspace-dir: workspace-main # 可选，默认 workspace-<agentName>
    provider:
      name: my-provider
      model: gpt-4o

      # 以下可选，优先级高于provider的配置
      timeout: 120000 # 可选
      temperature: 0.7 # 可选
      top-p: 0.9 # 可选
      recursion-limit: 100 # 可选
      auto-tool-discovery: false # 可选
      show-thinking-message: false # 可选，是否显示思考信息
      show-tool-message: false # 可选，是否显示工具信息
    channel:
      type: feishu
      app-id: FEISHU_APP_ID
      app-secret: FEISHU_APP_SECRET
      app-name: manbot
      reply-without-mention-groups: # 没有@任何人，则由main处理消息，避免每次在群聊中都要@机器人
        - oc_7d67xxxxxx

    # 可选，声明可以向哪些 agent 发送消息
    to-agents:
      - secondary-agent

  secondary-agent:
    workspace-dir: workspace-secondary
    provider:
      name: anthropic-provider
      model: claude-3-5-sonnet-20241022
    channel:
      type: feishu
      app-id: FEISHU_APP_ID_2
      app-secret: FEISHU_APP_SECRET_2
      app-name: manbot2
```

## 配置说明

### providers

提供商配置表，以名称为 key。

| 字段     | 类型   | 必填 | 说明                                                                                               |
| -------- | ------ | ---- | -------------------------------------------------------------------------------------------------- |
| type     | string | 是   | `openai` 或 `anthropic`                                                                            |
| base-url | string | 否   | API 基础地址，默认 OpenAI 为 `https://api.openai.com/v1`，Anthropic 为 `https://api.anthropic.com` |
| api-key  | string | 是   | API Key，支持 `${ENV_VAR}` 环境变量引用                                                            |

### agents

agent 列表，每个 agent 独立运行。

**agent.provider:**

| 字段                  | 类型    | 必填 | 说明                                              |
| --------------------- | ------- | ---- | ------------------------------------------------- |
| name                  | string  | 是   | 引用的 provider 名称                              |
| model                 | string  | 是   | 模型名称                                          |
| timeout               | number  | 否   | 请求超时时间（毫秒），默认 120000                 |
| temperature           | number  | 否   | 温度参数，默认 0.7                                |
| top-p                 | number  | 否   | Top-P 参数，默认 0.9                              |
| recursion-limit       | number  | 否   | 递归深度限制，默认 100                            |
| auto-tool-discovery   | boolean | 否   | 是否启用 MCP 工具自动发现，默认 false             |
| show-thinking-message | boolean | 否   | 是否显示思考内容（仅 Anthropic 模型），默认 false |

**agent.channel:**

| 字段       | 类型   | 必填 | 说明                            |
| ---------- | ------ | ---- | ------------------------------- |
| type       | string | 是   | 通道类型，目前仅支持 `feishu`   |
| app-id     | string | 是   | 飞书应用 App ID                 |
| app-secret | string | 是   | 飞书应用 App Secret             |
| app-name   | string | 否   | 应用名称，用于群聊中判断是否被@ |

**agent.workspace-dir:**

| 字段 | 类型   | 必填 | 说明                                   |
| ---- | ------ | ---- | -------------------------------------- |
| -    | string | 否   | 工作目录，默认 `workspace-<agentName>` |

## 环境变量引用

配置文件中支持 `${ENV_VAR}` 语法引用环境变量：

```yaml
providers:
  my-provider:
    api-key: ${OPENAI_API_KEY}
agents:
  main:
    channel:
      app-id: ${FEISHU_APP_ID}
      app-secret: ${FEISHU_APP_SECRET}
```

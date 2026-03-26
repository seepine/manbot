# Manbot - AI Assistant

[简体中文](./README.md) | English

Manbot is a lightweight intelligent assistant (~200 lines of core code) that integrates LLM + MCP + Skills capabilities directly into your Feishu workflow.

> The project is relatively new and may have breaking changes in the future. Please lock the version number when deploying and pay attention to the update guide when upgrading.

> The project has not been tested on Windows. You are welcome to deploy on Windows and report issues.

Built with [Bun](https://bun.sh), [Elysia](https://elysiajs.com), and [LangChain](https://js.langchain.com/), it supports Model Context Protocol (MCP) and skill loading, making it highly scalable and adaptable to various task requirements.

- **MCP Support**: Leverage the Model Context Protocol (MCP) to extend capabilities via external tools.
- **Skill Support**: Load custom skills from the workspace to enhance the bot's knowledge and abilities.
- **Task Management**: Support adding, checking, and executing scheduled tasks.
- **Flexible Configuration**: Easily configure LLM providers (OpenAI-compatible) and environment settings.
- **Feishu Integration**: Seamlessly interact with the bot through Feishu chats.

## Quick Deployment

We recommend using Docker Compose for quick deployment, or downloading the [binary file](https://github.com/seepine/manbot/releases) to run directly.

### 1. Copy configuration files

```bash
cp config.example.yml config.yml
cp docker-compose.example.yml docker-compose.yml
```

### 2. Configure config.yml

Edit the `config.yml` file to configure providers and agents. For detailed configuration, please refer to [Configuration](./docs/config.md).

### 3. Start Service

```bash
docker-compose up -d
```

Once the service is started, Manbot will run in the background and listen for Feishu messages.

## Configuration File

The configuration uses `config.yml` format and supports multiple agents running in parallel. For detailed configuration, please refer to [Configuration Documentation](./docs/config.md).

## Message Channel Configuration

### Feishu (Lark)

Manbot supports interacting with users via Feishu (Lark) chat. Configure the Feishu app's `app-id`, `app-secret`, and `app-name` in `config.yml`.
For detailed configuration, please refer to [Feishu (Lark) Integration](./docs/feishu.md).

## User Guide

### Skills Configuration

Directly tell Manbot the skill you want to add, and it will automatically add and load it for use.

### MCP Configuration

Directly tell Manbot the MCP you want to add, and it will automatically add and load it for use.

If the MCP needs to use the working directory, you can use `${workspaceFolder}` in the MCP configuration, which will be replaced with the actual working directory path.

For example, the following configuration:

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

### Task Configuration

Directly tell Manbot the task you want to add, or mention it in the chat, for example, `Remind me to have a meeting in 10 minutes`, and it will automatically add the task and execute it on time.

### Custom Prompts

Directly tell Manbot to modify `AGENTS.md` to your desired content, and it will automatically load and use it.

## License

This project is licensed under the [GPL-3.0](./LICENSE) license.

- **Personal/Open Source Use**: Free to use under GPL-3.0 terms (including open sourcing your derivative work).
- **Commercial/Closed Source Use**: If you wish to use this project for commercial products without open sourcing your code, please contact the author for a commercial license.

# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.4.30](https://github.com/seepine/manbot/compare/v0.4.29...v0.4.30) (2026-04-17)


### Features

* **system:** add persistent environment variable management tools ([894b7b4](https://github.com/seepine/manbot/commit/894b7b45ad3225fd11663844664bb6055ad3a609))
* **system:** update environment variable listing to return detailed JSON format ([6944c0c](https://github.com/seepine/manbot/commit/6944c0ce171f4e2cb51fdfe75867d2df4c4b1a96))


### Bug Fixes

* **Dockerfile:** update permissions and enhance environment variables for user setup ([b312c08](https://github.com/seepine/manbot/commit/b312c080d766cf3a364a81bd510c4d1f044f6464))

## [0.4.29](https://github.com/seepine/manbot/compare/v0.4.28...v0.4.29) (2026-04-16)


### Features

* **agent:** add thinking annotation support to response streaming ([a5dfff9](https://github.com/seepine/manbot/commit/a5dfff9c9e3035bd0074a79fa9fa2de10cccb8b7))

## [0.4.28](https://github.com/seepine/manbot/compare/v0.4.27...v0.4.28) (2026-04-02)

## [0.4.27](https://github.com/seepine/manbot/compare/v0.4.26...v0.4.27) (2026-03-31)

## [0.4.26](https://github.com/seepine/manbot/compare/v0.4.25...v0.4.26) (2026-03-31)

## [0.4.25](https://github.com/seepine/manbot/compare/v0.4.24...v0.4.25) (2026-03-31)


### Bug Fixes

* **bot:** add command validation to prevent dangerous operations ([3412e50](https://github.com/seepine/manbot/commit/3412e50304b1a20c57337b285c7b5b437fea94db))

## [0.4.24](https://github.com/seepine/manbot/compare/v0.4.23...v0.4.24) (2026-03-30)


### Bug Fixes

* **bot:** use structured logging format for agent invoke chunks ([1c66397](https://github.com/seepine/manbot/commit/1c663976623fcf5519c256052aa75d8729aef17d))

## [0.4.23](https://github.com/seepine/manbot/compare/v0.4.22...v0.4.23) (2026-03-30)


### Bug Fixes

* **agent,feishu:** add error handling for message parsing and memory operations ([6cf3b5e](https://github.com/seepine/manbot/commit/6cf3b5e200efa0cfbb538be9a86a5dda052b073b))

## [0.4.22](https://github.com/seepine/manbot/compare/v0.4.21...v0.4.22) (2026-03-30)

## [0.4.21](https://github.com/seepine/manbot/compare/v0.4.20...v0.4.21) (2026-03-29)


### Bug Fixes

* **feishu:** handle undefined response in error logging ([a4e102a](https://github.com/seepine/manbot/commit/a4e102a48e77f3f0980d86064eeaec8b1996145e))

## [0.4.20](https://github.com/seepine/manbot/compare/v0.4.19...v0.4.20) (2026-03-29)


### Features

* **feishu:** add reply-without-mention-groups config for auto-reply in specific groups ([68cd921](https://github.com/seepine/manbot/commit/68cd921a5e17709c5d49685cae4509c8ea574c11))
* **task:** add result callback tool for task execution ([73222ed](https://github.com/seepine/manbot/commit/73222ed7edbd740dd971a77d01960a970aadebe9))

## [0.4.19](https://github.com/seepine/manbot/compare/v0.4.18...v0.4.19) (2026-03-28)

## [0.4.18](https://github.com/seepine/manbot/compare/v0.4.17...v0.4.18) (2026-03-28)

## [0.4.17](https://github.com/seepine/manbot/compare/v0.4.16...v0.4.17) (2026-03-28)


### Features

* **mcp:** add default configuration for MCP servers ([a36b003](https://github.com/seepine/manbot/commit/a36b00321180de10c9bc68e19787534a6b6b582e))

## [0.4.16](https://github.com/seepine/manbot/compare/v0.4.15...v0.4.16) (2026-03-28)


### Features

* **mcp:** include args in MCP connection error logging ([dd19757](https://github.com/seepine/manbot/commit/dd19757c82876c7708ab9ab9aed08be220cdc6bf))

## [0.4.15](https://github.com/seepine/manbot/compare/v0.4.14...v0.4.15) (2026-03-28)


### Features

* **mcp:** add workspace variable substitution and tool name prefixing ([49b46c8](https://github.com/seepine/manbot/commit/49b46c8f164695c4134f3d5505a33e2db318ef4f))

## [0.4.14](https://github.com/seepine/manbot/compare/v0.4.13...v0.4.14) (2026-03-28)


### Features

* **mcp:** expose add/del/list mcp tools in prompt and improve error logging ([e93db5a](https://github.com/seepine/manbot/commit/e93db5a1f3d5c5bdc509a9e896eff2584b29cab0))

## [0.4.13](https://github.com/seepine/manbot/compare/v0.4.12...v0.4.13) (2026-03-28)

## [0.4.12](https://github.com/seepine/manbot/compare/v0.4.11...v0.4.12) (2026-03-28)


### Bug Fixes

* **feishu:** normalize newlines in message summary for card display ([117e765](https://github.com/seepine/manbot/commit/117e7658f186e7b0d0d628b2574f47b032960b10))

## [0.4.11](https://github.com/seepine/manbot/compare/v0.4.10...v0.4.11) (2026-03-28)


### Bug Fixes

* **memory:** handle non-existent file gracefully in FileMemory ([23f323d](https://github.com/seepine/manbot/commit/23f323d901a803153d3e6b23f8e626bcba2024fb))

## [0.4.10](https://github.com/seepine/manbot/compare/v0.4.9...v0.4.10) (2026-03-28)


### Features

* **bot:** add management tools to agent tool registry ([29c5b97](https://github.com/seepine/manbot/commit/29c5b97a5cc82aa84179751c07526ed8306c96d3))

## [0.4.9](https://github.com/seepine/manbot/compare/v0.4.8...v0.4.9) (2026-03-28)


### Bug Fixes

* update MCP storage instructions in prompt-default.txt ([286a5cd](https://github.com/seepine/manbot/commit/286a5cd56502db87e0ec1867262dd60c3f776df0))

## [0.4.8](https://github.com/seepine/manbot/compare/v0.4.7...v0.4.8) (2026-03-28)


### Features

* **mcp:** refactor MCP management and remove deprecated files ([8d6a4ff](https://github.com/seepine/manbot/commit/8d6a4ff25855e43bd143916516497691899e62ee))


### Bug Fixes

* update memory prompt import path to correct file ([794f5b8](https://github.com/seepine/manbot/commit/794f5b8dd3982ab73cb4edc166089c9c3d3c2971))

## [0.4.7](https://github.com/seepine/manbot/compare/v0.4.6...v0.4.7) (2026-03-28)


### Features

* **agent:** add configurable max history messages limit ([0369ff9](https://github.com/seepine/manbot/commit/0369ff926e99521038f922d3cb0bdb0e13ddb6d1))
* **agent:** add history retrieval tool with configurable memory modes ([18cce26](https://github.com/seepine/manbot/commit/18cce261037ca7cb2e0f6383de1499c65fb4461b))
* **agent:** add hook system and extract memory management to sub-agent ([ef914f6](https://github.com/seepine/manbot/commit/ef914f6d429cfeca421fd8e8dfbe68997f6d7ec4))

## [0.4.6](https://github.com/seepine/manbot/compare/v0.4.5...v0.4.6) (2026-03-28)

## [0.4.5](https://github.com/seepine/manbot/compare/v0.4.4...v0.4.5) (2026-03-28)


### Bug Fixes

* **agent:** correct inverted group chat condition ([5178e1d](https://github.com/seepine/manbot/commit/5178e1d68a56f14d5137bc295c9c3be83405df13))

## [0.4.4](https://github.com/seepine/manbot/compare/v0.4.3...v0.4.4) (2026-03-28)

## [0.4.3](https://github.com/seepine/manbot/compare/v0.4.2...v0.4.3) (2026-03-28)


### Features

* **agent:** add system info and command execution tools ([0d507da](https://github.com/seepine/manbot/commit/0d507da8935f72c4b98a4b5e638546ad1c8f0c60))

## [0.4.2](https://github.com/seepine/manbot/compare/v0.4.1...v0.4.2) (2026-03-27)


### Features

* **agent:** add to-agents config for controlling inter-agent communication ([4af6edc](https://github.com/seepine/manbot/commit/4af6edc3c939a1a20589c43bfc971340f91d3f09))


### Bug Fixes

* **agent:** change agent lifecycle from parallel to sequential execution ([c9dcce1](https://github.com/seepine/manbot/commit/c9dcce1b101629e44ecaf4674939bf31b542cd6a))

## [0.4.1](https://github.com/seepine/manbot/compare/v0.4.0...v0.4.1) (2026-03-27)

## [0.4.0](https://github.com/seepine/manbot/compare/v0.3.15...v0.4.0) (2026-03-27)


### ⚠ BREAKING CHANGES

* **config:** config.yml structure changed from `provider:` to `providers:` map format

* **config:** migrate to multi-provider architecture with named providers ([20dfd60](https://github.com/seepine/manbot/commit/20dfd6084f6233a097625fd6217cc8015af58e5a))


### Features

* **agent:** create Agent class with full logic ([0b59b20](https://github.com/seepine/manbot/commit/0b59b2044c756d9c52ec27a675031c77e54b2c64))
* **channel:** add Channel interface and factory ([3e1a3c5](https://github.com/seepine/manbot/commit/3e1a3c53a06e9fbf2f95702fe3dd77086b18e1f1))
* **config:** add config loader with env variable resolution ([56f3590](https://github.com/seepine/manbot/commit/56f3590881bf32003e6ebd7bc35b0a34d21f3ebc))
* **config:** add configuration types ([23c279c](https://github.com/seepine/manbot/commit/23c279c9d084e9487c8d14e8b8dba6b0df4b7050))


### Bug Fixes

* resolve type errors and add buildAgent factory function ([25a45a9](https://github.com/seepine/manbot/commit/25a45a9d9c4676e8afee8cd67e544b0bbf7ff792))

## [0.3.15](https://github.com/seepine/manbot/compare/v0.3.14...v0.3.15) (2026-03-21)

## [0.3.14](https://github.com/seepine/manbot/compare/v0.3.13...v0.3.14) (2026-03-21)

## [0.3.13](https://github.com/seepine/manbot/compare/v0.3.12...v0.3.13) (2026-03-19)


### Features

* **bot:** implement selective message persistence for conversation history ([e4bd027](https://github.com/seepine/manbot/commit/e4bd027bb658cfd27ca97660ff35364fbc3f1c3f))


### Bug Fixes

* **mcp-loader:** 修复确保配置文件存在时的文件引用问题 ([065958a](https://github.com/seepine/manbot/commit/065958ab88201d09fd50dbc749b7f0953c52af37))

## [0.3.12](https://github.com/seepine/manbot/compare/v0.3.10...v0.3.12) (2026-03-19)


### Features

* **bot:** add SHOW_THINKING config option to display thinking content ([519afec](https://github.com/seepine/manbot/commit/519afec178d97feffa4a451d48777693b9a7588f))

## [0.3.10](https://github.com/seepine/manbot/compare/v0.3.9...v0.3.10) (2026-03-19)

## [0.3.9](https://github.com/seepine/manbot/compare/v0.3.8...v0.3.9) (2026-03-18)


### Features

* 添加对 Anthropic API 的支持，更新相关配置和依赖 ([25d6355](https://github.com/seepine/manbot/commit/25d6355e7805dd2690b1e41167b5188ee421d2e6))

## [0.3.8](https://github.com/seepine/manbot/compare/v0.3.7...v0.3.8) (2026-03-17)


### Features

* 优化 MCP 工具加载逻辑 ([6193af3](https://github.com/seepine/manbot/commit/6193af3d7b39ad4cb60f646146f0020f92609f08))

## [0.3.7](https://github.com/seepine/manbot/compare/v0.3.6...v0.3.7) (2026-03-09)


### Features

* 添加子代理工具集以处理复杂任务 ([d19ab84](https://github.com/seepine/manbot/commit/d19ab848424ae3a80eb52c5f0b24388fc93869c1))

## [0.3.6](https://github.com/seepine/manbot/compare/v0.3.5...v0.3.6) (2026-03-06)


### Bug Fixes

* 优化消息流处理逻辑 ([e544c0b](https://github.com/seepine/manbot/commit/e544c0b0c53a98bb4095ead98e079073ff6db314))

## [0.3.5](https://github.com/seepine/manbot/compare/v0.3.4...v0.3.5) (2026-03-06)


### Bug Fixes

* 调整打印频率配置，优化流式消息输出 ([2f826fb](https://github.com/seepine/manbot/commit/2f826fbfe342e9c6bacc93f121d88d2bee85b140))

## [0.3.4](https://github.com/seepine/manbot/compare/v0.3.3...v0.3.4) (2026-03-05)


### Features

* **mcp:** 增强重连配置并优化工具服务器格式 ([5d67c59](https://github.com/seepine/manbot/commit/5d67c59f57d0035648d9b339b4ad8f19ccfef0ac))


### Bug Fixes

* 重构 MCP 工具加载逻辑，增加配置解析和默认重连设置 ([08db819](https://github.com/seepine/manbot/commit/08db8194054058c9dead85fbdad913def3249a71))

## [0.3.3](https://github.com/seepine/manbot/compare/v0.3.2...v0.3.3) (2026-03-05)


### Features

* 增强工具注册表，添加获取可用工具提示的方法 ([7db4ab1](https://github.com/seepine/manbot/commit/7db4ab1dbc149290106c139a6600b4f65b2773ea))


### Bug Fixes

* 增加工具调用和返回信息的换行符以改善可读性 ([daaf573](https://github.com/seepine/manbot/commit/daaf5738b0176efa638a3dfce1c1f39afca7e2b0))

## [0.3.2](https://github.com/seepine/manbot/compare/v0.3.1...v0.3.2) (2026-03-05)


### Features

* 添加工具注册表以支持工具的按需发现与调用 ([627d254](https://github.com/seepine/manbot/commit/627d25438d9e585dc40d18a0ef8bf1e6df1b639f))


### Bug Fixes

* 修改tavily搜索服务器的键名为web-search ([505cf39](https://github.com/seepine/manbot/commit/505cf3979503150e60c8a6d3c3c84ccf8c150e52))
* 修改默认最大消息为20 ([8a4b673](https://github.com/seepine/manbot/commit/8a4b6739de6752fe9f355869bcf0123add115a04))

## [0.3.1](https://github.com/seepine/manbot/compare/v0.3.0...v0.3.1) (2026-03-02)


### Features

* **bot:** 重构历史消息持久化 ([7c042de](https://github.com/seepine/manbot/commit/7c042def225b46bda9f0978bcfc9ae9e8ed6f8a4))

## [0.3.0](https://github.com/seepine/manbot/compare/v0.2.3...v0.3.0) (2026-03-02)


### Features

* 增加下载功能 ([6f6783d](https://github.com/seepine/manbot/commit/6f6783d0e27d73506d8593f2aca2fb96ad5714c5))

## [0.2.3](https://github.com/seepine/manbot/compare/v0.2.2...v0.2.3) (2026-03-01)


### Bug Fixes

* 添加 OpenAI 高级配置参数支持 ([d0c9358](https://github.com/seepine/manbot/commit/d0c93582e02fc3c226c14418ffaab0df8876932d))

## [0.2.2](https://github.com/seepine/manbot/compare/v0.2.1...v0.2.2) (2026-03-01)


### Features

* **mcp:** 添加代理环境变量 ([089a42e](https://github.com/seepine/manbot/commit/089a42ebc5d4af5bad760ff068e62e00186cef70))

## [0.2.1](https://github.com/seepine/manbot/compare/v0.2.0...v0.2.1) (2026-03-01)


### Bug Fixes

* docker 下默认启用终端 ([05f46cb](https://github.com/seepine/manbot/commit/05f46cb1c04175322456b805bd8b6532534dbb6e))

## [0.2.0](https://github.com/seepine/manbot/compare/v0.1.0...v0.2.0) (2026-03-01)


### Features

* **docker:** 重构容器配置 ([bd7b9aa](https://github.com/seepine/manbot/commit/bd7b9aa23973a98b524c79160c6de18d96b47b3d))

## 0.1.0 (2026-03-01)

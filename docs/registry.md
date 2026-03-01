# 配置国内源

## npm/bun

> 项目使用 bunx 代替 npx

### 1. 创建配置文件

- Linux/macOS：`~/.bunfig.toml`
- Windows：`C:\Users\%用户名%\.bunfig.toml`

### 2. 配置国内源

编辑 `.bunfig.toml` 文件，添加以下内容：

```toml
[install]
registry = "https://registry.npmmirror.com"
```

## uv

### 1. 创建配置文件

- Linux/macOS：`~/.config/uv/config.toml`
- Windows：`C:\Users\%用户名%\.config\uv\config.toml`

### 2. 配置国内源

编辑 `config.toml` 文件，添加以下内容：

```toml
[registries.pypi]
index = "https://mirrors.aliyun.com/pypi/simple/"
```

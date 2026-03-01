import { $ } from 'bun'

// 判断当前操作系统是否为 Windows
const isWin = process.platform === 'win32'

try {
  if (isWin) {
    // Windows: 使用 PowerShell 查找并终止包含 'inspect=/elysia' 的进程
    // -ErrorAction SilentlyContinue 用于忽略未找到进程时的错误
    const cmd = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*inspect=/elysia*' } | Stop-Process -Force -ErrorAction SilentlyContinue`
    await $`powershell -NoProfile -Command "${cmd}"`
  } else {
    // macOS/Linux: 使用 pkill 查找并终止包含 'bun.*elysia' 的进程
    // || true 用于防止未找到进程时抛出错误
    await $`pkill -f 'bun.*elysia' || true`
  }
  console.log('Development server stopped successfully.')
} catch (error) {
  // 忽略错误，因为如果进程不存在，不需要报错
  console.log('No running development server found.')
}

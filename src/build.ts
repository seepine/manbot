import { build } from 'bun'

/**
 * 构建脚本
 * @example bun run build
 * @example bun run build --js
 * @example bun run build --target=bun-windows-x64
 */
const args = process.argv.slice(2)
const isJs = args.find((arg) => arg.startsWith('--js') || arg.startsWith('-j')) !== undefined
const targetArg = args.find((arg) => arg.startsWith('--target='))
const target = targetArg ? targetArg.split('=')[1] : undefined

const appName = `manbot`

const res = await build({
  entrypoints: ['src/index.ts'],
  target: 'bun',
  minify: true,
  sourcemap: 'linked',
  outdir: 'dist',
  compile: isJs
    ? false
    : {
        outfile: target ? `${appName}-${target.replace('bun-', '')}` : appName,
        ...(target ? { target: target as any } : {}),
      },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})

const cwd = process.cwd()
res.outputs.forEach((output) => {
  console.log(output.path.replace(`${cwd}/`, ''), `${(output.size / 1024 / 1024).toFixed(2)} MB`)
})

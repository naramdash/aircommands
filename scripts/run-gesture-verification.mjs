import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const outfile = resolve('.tmp/verify-gestures.mjs')

await mkdir(resolve('.tmp'), { recursive: true })
await build({
  entryPoints: ['scripts/verify-gestures.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
})

await import(pathToFileURL(outfile).href)

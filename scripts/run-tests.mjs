import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { build } from 'esbuild'

const testRoots = ['app', 'server']
const outdir = resolve('.tmp/tests')

if (existsSync(outdir)) {
  rmSync(outdir, { recursive: true, force: true })
}
mkdirSync(outdir, { recursive: true })

const testFiles = testRoots.flatMap((root) => findTestFiles(resolve(root)))

if (testFiles.length === 0) {
  console.log('No test files found.')
  process.exit(0)
}

const result = await build({
  entryPoints: testFiles,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir,
  outbase: resolve('.'),
  outExtension: {
    '.js': '.mjs',
  },
  packages: 'external',
  sourcemap: 'inline',
  metafile: true,
})

const outputFiles = Object.keys(result.metafile.outputs)
  .filter((file) => file.endsWith('.mjs'))
  .map((file) => resolve(file))

const testResult = spawnSync(process.execPath, ['--test', ...outputFiles], {
  stdio: 'inherit',
})

process.exit(testResult.status ?? 1)

function findTestFiles(directory) {
  if (!existsSync(directory)) return []

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      return findTestFiles(path)
    }

    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      return [relative(resolve('.'), path)]
    }

    return []
  })
}


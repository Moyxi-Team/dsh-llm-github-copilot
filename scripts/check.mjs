import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' })
const npmCli = process.env.npm_execpath

run(process.execPath, ['scripts/build.mjs'])
run(process.execPath, ['--test', 'tests/build.test.mjs'])
run(npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm',
  npmCli ? [npmCli, 'pack', '--dry-run', '--json'] : ['pack', '--dry-run', '--json'])
console.log('check complete')

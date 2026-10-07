/**
 * Build GL Work for macOS (docs/fork/changes/glwork-brand.md): the same steps as
 * `pnpm build:mac`, packaged with config/glwork-builder.config.cjs.
 *
 *   node config/scripts/glwork-build-mac.mjs          # .dmg and .zip
 *   node config/scripts/glwork-build-mac.mjs --dir    # the .app only, for trying it locally
 */
import { execFileSync } from 'node:child_process'
import { getLocalBuildIdentity } from './build-mac-local.mjs'

const dirOnly = process.argv.includes('--dir')
const pnpm = (args, env = process.env) => execFileSync('pnpm', args, { env, stdio: 'inherit' })

for (const step of [
  'build:desktop',
  'build:computer-macos',
  'build:keyboard-layout-macos',
  'build:notification-status-macos',
  'ensure:electron-runtime'
]) {
  pnpm(['run', step])
}
const identity = getLocalBuildIdentity()
console.log(`[glwork:build-mac] version ${identity.version}`)
// Why: a full build covers arm64 and x64 (needs `pnpm install:release`); --dir is this Mac's architecture only.
const dirArgs = dirOnly ? ['--dir', `--${process.arch}`] : []
pnpm(
  ['exec', 'electron-builder', '--config', 'config/glwork-builder.config.cjs', '--mac', ...dirArgs],
  {
    ...process.env,
    ORCA_BUILD_COMMIT: identity.commit,
    ORCA_LOCAL_BUILD_VERSION: identity.version
  }
)

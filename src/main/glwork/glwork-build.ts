import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** GL Work: GL-Game-Group's build of Orca (docs/fork/changes/glwork-brand.md). */
export const GLWORK_PRODUCT_NAME = 'GL Work'
export const GLWORK_APP_ID = 'com.glgwork.work'

/** Profile directories under appData, apart from the earlier GL Work ("GL Work") and from Orca's. */
export const GLWORK_USER_DATA_DIR = 'glwork'
export const GLWORK_DEV_USER_DATA_DIR = 'glwork-dev'

let cached: boolean | undefined

/**
 * Whether this process is GL Work: a package built with config/glwork-builder.config.cjs (its
 * package.json carries `glwork: true`), or a development run started with GLWORK_BUILD=1.
 * Why the marker, not app.getName(): packaged Orca reports "orca" until it renames itself "Orca".
 */
export function isGlWorkBuild(): boolean {
  if (process.env.GLWORK_BUILD === '1') {
    return true
  }
  cached ??= readGlWorkMarker()
  return cached
}

function readGlWorkMarker(): boolean {
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')
    )
    return (
      typeof manifest === 'object' &&
      manifest !== null &&
      'glwork' in manifest &&
      manifest.glwork === true
    )
  } catch {
    return false
  }
}

/** For tests: forget the marker read. */
export function resetGlWorkBuildForTests(): void {
  cached = undefined
}

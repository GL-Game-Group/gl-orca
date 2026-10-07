/**
 * GL Work's packaging (docs/fork/changes/glwork-brand.md): Orca's electron-builder config
 * with GL Work's identity, its own profile directory (src/main/glwork/glwork-build.ts reads
 * the product name) and no Orca release feed. Run through config/scripts/glwork-build-mac.mjs.
 */
const base = require('./electron-builder.config.cjs')

const PRODUCT_NAME = 'GL Work'

/** macOS privacy prompts name the app asking. */
function rebrand(value) {
  return typeof value === 'string' ? value.replace(/\bOrca\b/g, PRODUCT_NAME) : value
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,
  appId: 'com.glgwork.work',
  productName: PRODUCT_NAME,
  // Why: the app reads this marker (src/main/glwork/glwork-build.ts); its name stays "orca" until Orca renames it.
  extraMetadata: { ...base.extraMetadata, glwork: true },
  mac: {
    ...base.mac,
    icon: 'resources/glwork/icon.icns',
    extendInfo: Object.fromEntries(
      Object.entries(base.mac?.extendInfo ?? {}).map(([key, value]) => [key, rebrand(value)])
    )
  },
  // Why: GL Work has no release feed yet; without this the packager writes Orca's GitHub feed.
  publish: null
}

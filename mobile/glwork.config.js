// GL Work's phone app (docs/fork/changes/glwork-mobile-brand.md): Orca's Expo config with GL Work's
// name, bundle id and artwork when built with EXPO_PUBLIC_GLWORK_BUILD=1 (also inlined into the app: src/storage/preferences.ts); Orca's own builds are untouched.
// Artwork comes from agent-work's `pnpm brand` (assets/glwork/).
const { withEntitlementsPlist } = require('expo/config-plugins')

const NAME = 'GL Work'
const BUNDLE_ID = 'com.glgwork.work'

/** Expo adds expo-notifications' push entitlement whenever the package is installed; GL Work has no pushes yet. */
function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment']
    return mod
  })
}

/** iOS permission prompts and plugin texts name the app asking. */
function rebrand(value) {
  return typeof value === 'string' ? value.replace(/\bOrca\b/g, NAME) : value
}

function rebrandAll(record) {
  return Object.fromEntries(
    Object.entries(record ?? {}).map(([key, value]) => [key, rebrand(value)])
  )
}

function withGlWork(config) {
  if (process.env.EXPO_PUBLIC_GLWORK_BUILD !== '1') {
    return config
  }
  const plugins = (config.plugins ?? []).flatMap((plugin) => {
    const [name, options] = Array.isArray(plugin) ? plugin : [plugin, undefined]
    // Why: Orca's pushes come through Orca's cloud, which GL Work does not use (yet).
    if (name === 'expo-notifications') {
      return []
    }
    if (name === 'expo-splash-screen') {
      return [[name, { ...options, image: './assets/glwork/splash-icon.png' }]]
    }
    return [options ? [name, rebrandAll(options)] : plugin]
  })
  const { 'aps-environment': _push, ...entitlements } = config.ios?.entitlements ?? {}
  return {
    ...config,
    name: NAME,
    icon: './assets/glwork/icon.png',
    splash: { ...config.splash, image: './assets/glwork/splash-icon.png' },
    ios: {
      ...config.ios,
      bundleIdentifier: BUNDLE_ID,
      entitlements,
      infoPlist: rebrandAll(config.ios?.infoPlist)
    },
    plugins: [...plugins, withoutPushEntitlement, require('./plugins/glwork-scene-lifecycle')]
  }
}

/** Orca's config function, with GL Work's changes applied on top. */
function wrapExpoConfig(orcaConfig) {
  return (context) => withGlWork(orcaConfig(context))
}

module.exports = { withGlWork, wrapExpoConfig }

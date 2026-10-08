import { bundledGlWorkBuild } from '../../storage/preferences'

/** Built with EXPO_PUBLIC_GLWORK_BUILD=1 (glwork.config.js): GL Work's phone app rather than Orca's. */
export function isGlWorkApp(): boolean {
  return bundledGlWorkBuild()
}

/** Where "pair a desktop" leads: GL Work pairs through the company account, Orca by QR code. */
export function pairDesktopRoute(): '/glwork' | '/pair-scan' {
  return isGlWorkApp() ? '/glwork' : '/pair-scan'
}

/** The app's name where Orca's screens spell it out. */
export function appDisplayName(): 'GL Work' | 'Orca' {
  return isGlWorkApp() ? 'GL Work' : 'Orca'
}

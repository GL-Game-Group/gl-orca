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

/**
 * GL Work shows a terminal agent as chat only once the desktop reports its status: without the agent
 * status hooks (off until the member agrees) the chat could never find the session, so the tab stays
 * a terminal at once; with them, it turns into chat as soon as the agent's first status arrives.
 */
export function glworkNeedsAgentStatusForChat(agentStatus: unknown): boolean {
  return isGlWorkApp() && (agentStatus === null || agentStatus === undefined)
}

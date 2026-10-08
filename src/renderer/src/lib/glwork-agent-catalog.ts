import { isGlWorkRetiredAgent } from '../../../shared/glwork-retired-agents'
import type { AgentCatalogEntry } from './agent-catalog'

/** eva: GL Work lists no retired agent (Qoder, replaced by Qoder CN); Orca's builds list them all. */
export function withoutGlWorkRetiredAgents(entries: AgentCatalogEntry[]): AgentCatalogEntry[] {
  if (typeof window === 'undefined' || window.api?.glwork?.isBuild !== true) {
    return entries
  }
  return entries.filter((entry) => !isGlWorkRetiredAgent(entry.id))
}

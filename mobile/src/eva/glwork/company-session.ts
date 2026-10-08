import * as SecureStore from 'expo-secure-store'
import { setCompanySocketSession, type CompanySession } from './company-socket'

/** The GL Work company service (agent-work's gateway); members may point at another for testing. */
export const GLWORK_DEFAULT_SERVER = 'https://agent.glwork.net'

export type { CompanySession }

const KEY = 'glwork.company-session'
// Why: kept off iCloud Keychain and backups, like Orca's own pairing credentials.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
}

let loading: Promise<CompanySession | null> | null = null

function readSession(raw: string | null): CompanySession | null {
  if (!raw) {
    return null
  }
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) {
      return null
    }
    const fields: Record<string, unknown> = { ...value }
    const { server, token, member, displayName, expiresAt } = fields
    if (
      typeof server !== 'string' ||
      typeof token !== 'string' ||
      typeof member !== 'string' ||
      typeof expiresAt !== 'number' ||
      expiresAt <= Date.now()
    ) {
      return null
    }
    return {
      server,
      token,
      member,
      displayName: typeof displayName === 'string' ? displayName : member,
      expiresAt
    }
  } catch {
    return null
  }
}

export function loadCompanySession(): Promise<CompanySession | null> {
  loading ??= SecureStore.getItemAsync(KEY, OPTIONS)
    .then((raw) => {
      const session = readSession(raw)
      setCompanySocketSession(session)
      return session
    })
    .catch(() => null)
  return loading
}

export async function saveCompanySession(session: CompanySession): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session), OPTIONS)
  setCompanySocketSession(session)
  loading = Promise.resolve(session)
}

export async function clearCompanySession(): Promise<void> {
  setCompanySocketSession(null)
  loading = Promise.resolve(null)
  await SecureStore.deleteItemAsync(KEY, OPTIONS)
}

// Why at import: sockets open synchronously, so the session must be in memory before the first one
// (app/_layout.tsx imports this module at launch).
void loadCompanySession()

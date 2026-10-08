import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * GL Work's voice choices on this phone (not the desktop's): which company vendor recognizes speech
 * (null: the desktop's own dictation, as Orca does), and how replies are read aloud.
 */
export type GlWorkVoicePrefs = {
  asrVendor: string | null
  /** With `asrVendor`: words as they are spoken (实时), or the whole recording at the end (识别). */
  asrKind: 'realtime' | 'file'
  /** How the chat composer takes input: the keyboard (Orca's), or hold-to-talk. */
  inputMode: 'keyboard' | 'voice'
  tts: {
    autoRead: boolean
    vendor: string | null
    /** Streamed (实时) or whole (语音); null: whichever the vendor offers first. */
    kind: 'stream' | 'file' | null
    voice: string | null
    /** Volcengine's speech_rate, -50 (slow) … 100 (fast); Qwen reads at its own pace. */
    rate: number
  }
}

const KEY = 'glwork:voice-prefs'
const DEFAULTS: GlWorkVoicePrefs = {
  asrVendor: null,
  asrKind: 'realtime',
  inputMode: 'keyboard',
  tts: { autoRead: false, vendor: null, kind: null, voice: null, rate: 0 }
}

let current: GlWorkVoicePrefs = DEFAULTS
let loaded: Promise<GlWorkVoicePrefs> | null = null
const listeners = new Set<(prefs: GlWorkVoicePrefs) => void>()

function read(raw: string | null): GlWorkVoicePrefs {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    if (typeof value !== 'object' || value === null) {
      return DEFAULTS
    }
    const fields: Record<string, unknown> = { ...value }
    const tts: Record<string, unknown> =
      typeof fields.tts === 'object' && fields.tts !== null ? { ...fields.tts } : {}
    return {
      asrVendor: typeof fields.asrVendor === 'string' ? fields.asrVendor : null,
      asrKind: fields.asrKind === 'file' ? 'file' : 'realtime',
      inputMode: fields.inputMode === 'voice' ? 'voice' : 'keyboard',
      tts: {
        autoRead: tts.autoRead === true,
        vendor: typeof tts.vendor === 'string' ? tts.vendor : null,
        kind: tts.kind === 'stream' || tts.kind === 'file' ? tts.kind : null,
        voice: typeof tts.voice === 'string' ? tts.voice : null,
        rate: typeof tts.rate === 'number' ? Math.max(-50, Math.min(100, tts.rate)) : 0
      }
    }
  } catch {
    return DEFAULTS
  }
}

export function loadGlWorkVoicePrefs(): Promise<GlWorkVoicePrefs> {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      current = read(raw)
      return current
    })
    .catch(() => current)
  return loaded
}

export function currentGlWorkVoicePrefs(): GlWorkVoicePrefs {
  return current
}

export async function saveGlWorkVoicePrefs(
  change: (prefs: GlWorkVoicePrefs) => GlWorkVoicePrefs
): Promise<GlWorkVoicePrefs> {
  await loadGlWorkVoicePrefs()
  current = change(current)
  loaded = Promise.resolve(current)
  for (const listener of listeners) {
    listener(current)
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(current))
  return current
}

export function subscribeGlWorkVoicePrefs(listener: (prefs: GlWorkVoicePrefs) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

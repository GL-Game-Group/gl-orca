import { useEffect, useState } from 'react'
import { isGlWorkApp } from '../glwork-app'
import type { CompanyVoiceVendor } from './company-voice'
import { loadVoiceVendors } from './glwork-voice-lazy'
import {
  currentGlWorkVoicePrefs,
  loadGlWorkVoicePrefs,
  saveGlWorkVoicePrefs,
  subscribeGlWorkVoicePrefs,
  type GlWorkVoicePrefs
} from './glwork-voice-prefs'

export type GlWorkVoiceVendors =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'error'; message: string }
  | { state: 'ready'; vendors: CompanyVoiceVendor[] }

/** The company voice vendors open to this member, read when Settings → Voice opens. */
export function useGlWorkVoiceVendors(): GlWorkVoiceVendors {
  const [vendors, setVendors] = useState<GlWorkVoiceVendors>({ state: 'loading' })
  useEffect(() => {
    if (!isGlWorkApp()) {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const read = await loadVoiceVendors(true)
        if (!cancelled) {
          setVendors(read)
        }
      } catch (error) {
        if (!cancelled) {
          setVendors({
            state: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return vendors
}

export function useGlWorkVoicePrefs(): GlWorkVoicePrefs {
  const [prefs, setPrefs] = useState(currentGlWorkVoicePrefs)
  useEffect(() => {
    void loadGlWorkVoicePrefs().then(setPrefs)
    return subscribeGlWorkVoicePrefs(setPrefs)
  }, [])
  return prefs
}

/** Back to the desktop's dictation (picking one of its models does this). */
export function clearGlWorkCloudAsr(): void {
  void saveGlWorkVoicePrefs((prefs) => ({ ...prefs, asrVendor: null }))
}

/** What the speech model row shows while a company vendor recognizes speech; null otherwise. */
export function useGlWorkAsrLabel(): string | null {
  const prefs = useGlWorkVoicePrefs()
  const vendors = useGlWorkVoiceVendors()
  if (!isGlWorkApp() || !prefs.asrVendor) {
    return null
  }
  const vendor =
    vendors.state === 'ready' ? vendors.vendors.find((v) => v.id === prefs.asrVendor) : null
  return vendor?.asr ? `${vendor.name} · ${vendor.asr.model}` : '公司云端识别'
}

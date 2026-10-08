import { useCallback, useEffect, useRef, useState } from 'react'
import { useDictationCapture } from '../../../platform/dictation-capture'
import type {
  DictationStatus,
  UseMobileDictationOptions,
  UseMobileDictationResult
} from '../../../hooks/mobile-dictation-session-state'
import { isGlWorkApp } from '../glwork-app'
import type { CloudAsrSession } from './cloud-asr'
import { setGlWorkDictationLive } from './glwork-dictation-live'
import {
  currentGlWorkVoicePrefs,
  loadGlWorkVoicePrefs,
  subscribeGlWorkVoicePrefs
} from './glwork-voice-prefs'
import { stopGlWorkSpeech } from './glwork-speech-state'
import { startCloudAsr } from './glwork-voice-lazy'

/**
 * Dictation through a company voice vendor, straight from the phone: the same microphone seam and
 * the same states as Orca's desktop dictation (use-mobile-dictation), so the composer's mic button and
 * transcript routing do not change. Null while this phone uses the desktop's dictation.
 */
export function useGlWorkCloudDictation(
  options: UseMobileDictationOptions
): UseMobileDictationResult | null {
  const capture = useDictationCapture()
  const [vendor, setVendor] = useState<string | null>(() => currentGlWorkVoicePrefs().asrVendor)
  const [kind, setKind] = useState(() => currentGlWorkVoicePrefs().asrKind)
  const [status, setStatus] = useState<DictationStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef<CloudAsrSession | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    const take = (prefs: { asrVendor: string | null; asrKind: 'realtime' | 'file' }): void => {
      setVendor(prefs.asrVendor)
      setKind(prefs.asrKind)
    }
    void loadGlWorkVoicePrefs().then(take)
    return subscribeGlWorkVoicePrefs(take)
  }, [])

  // `notify` false: start's caller reports the rejection itself (as with Orca's dictation).
  const fail = useCallback(
    (err: unknown, notify = true) => {
      const normalized = err instanceof Error ? err : new Error(String(err))
      sessionRef.current?.cancel()
      sessionRef.current = null
      void capture.end()
      setGlWorkDictationLive('')
      setError(normalized.message)
      setStatus('error')
      if (notify) {
        optionsRef.current.onError?.(normalized)
      }
    },
    [capture]
  )

  useEffect(() => {
    const chunks = capture.onChunk((chunk) => sessionRef.current?.feed(chunk.data))
    const interruptions = capture.onInterruption(() => {
      if (sessionRef.current) {
        fail(new Error('录音被打断了。'))
      }
    })
    return () => {
      chunks.remove()
      interruptions.remove()
    }
  }, [capture, fail])

  const start = useCallback(async () => {
    if (!vendor || sessionRef.current || !optionsRef.current.enabled) {
      return
    }
    stopGlWorkSpeech()
    setError(null)
    setStatus('starting')
    try {
      sessionRef.current = await startCloudAsr(vendor, kind, {
        onText: setGlWorkDictationLive,
        onError: fail
      })
      const opened = await capture.open()
      if (!opened.ok) {
        throw new Error(
          opened.reason === 'permission-denied'
            ? '没有麦克风权限，请在系统设置里允许 GL Work 使用麦克风。'
            : '麦克风不可用。'
        )
      }
      if (!capture.begin()) {
        throw new Error('麦克风没有开始录音。')
      }
      setStatus('recording')
    } catch (err) {
      fail(err, false)
      throw err
    }
  }, [capture, fail, vendor, kind])

  const stop = useCallback(async () => {
    const session = sessionRef.current
    if (!session) {
      return
    }
    setStatus('processing')
    await capture.end()
    try {
      const text = await session.finish()
      sessionRef.current = null
      setGlWorkDictationLive('')
      setStatus('idle')
      if (text) {
        optionsRef.current.onTranscript(text)
      }
    } catch (err) {
      fail(err)
    }
  }, [capture, fail])

  const cancel = useCallback(async () => {
    sessionRef.current?.cancel()
    sessionRef.current = null
    await capture.end()
    setGlWorkDictationLive('')
    setStatus('idle')
  }, [capture])

  if (!isGlWorkApp() || !vendor) {
    return null
  }
  return {
    status,
    isStarting: status === 'starting',
    isRecording: status === 'recording',
    isProcessing: status === 'processing',
    error,
    start,
    stop,
    cancel
  }
}

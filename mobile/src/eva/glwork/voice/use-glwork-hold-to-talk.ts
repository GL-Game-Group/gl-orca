import { useCallback, useEffect, useRef, useState } from 'react'
import { useDictationCapture } from '../../../platform/dictation-capture'
import type { CloudAsrSession } from './cloud-asr'
import { stopGlWorkSpeech } from './glwork-speech-state'
import { loadVoiceVendors, startCloudAsr } from './glwork-voice-lazy'
import { loadGlWorkVoicePrefs } from './glwork-voice-prefs'

export type HoldToTalkState = 'idle' | 'starting' | 'recording' | 'finishing'

/**
 * The recognizer hold-to-talk uses: the one picked in Settings → Voice, else the first the company
 * opens — the desktop's dictation only answers after the speaker stops, so it cannot show live text.
 */
async function pickAsrVendor(): Promise<string> {
  const [prefs, loaded] = await Promise.all([loadGlWorkVoicePrefs(), loadVoiceVendors()])
  if (loaded.state === 'signed-out') {
    throw new Error('请先在 GL Work 里登录公司账号，才能按住说话。')
  }
  const asr = loaded.vendors.filter((vendor) => vendor.asr)
  const vendor = asr.find((entry) => entry.id === prefs.asrVendor) ?? asr[0]
  if (!vendor) {
    throw new Error('管理员还没有为你开放语音识别（千问或火山）。')
  }
  return vendor.id
}

/**
 * Hold-to-talk's recording: the microphone into a company recognizer, with the words so far. Each
 * hold is its own generation, so a release that lands while the recognizer is still connecting
 * (a quick tap) cancels that start instead of leaving the microphone open.
 */
export function useGlWorkHoldToTalk(onError: (error: Error) => void) {
  const capture = useDictationCapture()
  const [state, setState] = useState<HoldToTalkState>('idle')
  const [text, setText] = useState('')
  const textRef = useRef('')
  const sessionRef = useRef<CloudAsrSession | null>(null)
  const generationRef = useRef(0)
  /** A hold is under way (starting, recording or finishing). */
  const activeRef = useRef(false)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const reset = useCallback(() => {
    generationRef.current += 1
    activeRef.current = false
    sessionRef.current?.cancel()
    sessionRef.current = null
    void capture.end()
    textRef.current = ''
    setText('')
    setState('idle')
  }, [capture])

  const fail = useCallback(
    (error: unknown) => {
      reset()
      onErrorRef.current(error instanceof Error ? error : new Error(String(error)))
    },
    [reset]
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
    const mine = ++generationRef.current
    const current = (): boolean => mine === generationRef.current
    activeRef.current = true
    stopGlWorkSpeech()
    textRef.current = ''
    setText('')
    setState('starting')
    try {
      const vendor = await pickAsrVendor()
      const session = await startCloudAsr(vendor, {
        onText: (heard) => {
          if (current()) {
            textRef.current = heard
            setText(heard)
          }
        },
        onError: (error) => {
          if (current()) {
            fail(error)
          }
        }
      })
      if (!current()) {
        session.cancel()
        return
      }
      sessionRef.current = session
      const opened = await capture.open()
      if (!current()) {
        return
      }
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
      setState('recording')
    } catch (error) {
      if (current()) {
        fail(error)
      }
    }
  }, [capture, fail])

  /** Stops listening and resolves with everything heard (the recognizer's final words). */
  const finish = useCallback(async (): Promise<string> => {
    const session = sessionRef.current
    const heard = textRef.current
    if (!session) {
      reset()
      return heard
    }
    const mine = generationRef.current
    setState('finishing')
    await capture.end()
    try {
      const final = await session.finish()
      return final || heard
    } catch (error) {
      if (mine === generationRef.current) {
        fail(error)
      }
      return ''
    } finally {
      if (mine === generationRef.current) {
        sessionRef.current = null
        reset()
      }
    }
  }, [capture, fail, reset])

  // Leaving the chat mid-hold must not leave the microphone open; an idle one is not ours to touch.
  useEffect(
    () => () => {
      if (activeRef.current) {
        reset()
      }
    },
    [reset]
  )

  return { state, text, start, finish, cancel: reset }
}

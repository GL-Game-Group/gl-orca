import { lazy, Suspense, type ComponentProps } from 'react'
import { MobileNativeChatComposer } from '../../../session/MobileNativeChatComposer'
import { isGlWorkApp } from '../glwork-app'
import { useGlWorkVoicePrefs } from './use-glwork-voice-settings'

type Props = ComponentProps<typeof MobileNativeChatComposer>

// Hold-to-talk needs native modules (microphone, haptics): loaded only once voice mode is on, so
// Orca's builds, keyboard mode and the chat view's tests never load them.
const GlWorkVoiceComposer = lazy(() => import('./GlWorkVoiceComposer'))

/**
 * eva: the chat view's composer — Orca's, or GL Work's hold-to-talk bar in voice mode (switched in
 * the session's ⋯ → 语音). Same props as Orca's, so the chat view only names this instead.
 */
export function GlWorkChatComposer(props: Props) {
  const prefs = useGlWorkVoicePrefs()
  if (!isGlWorkApp() || prefs.inputMode !== 'voice') {
    return <MobileNativeChatComposer {...props} />
  }
  return (
    <Suspense fallback={<MobileNativeChatComposer {...props} />}>
      <GlWorkVoiceComposer {...props} />
    </Suspense>
  )
}

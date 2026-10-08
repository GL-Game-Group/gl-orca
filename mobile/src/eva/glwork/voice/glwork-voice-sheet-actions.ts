import { AudioLines, Keyboard, Mic } from 'lucide-react-native'
import type { ActionSheetAction } from '../../../components/ActionSheetModal'
import { isGlWorkApp } from '../glwork-app'
import { currentGlWorkVoicePrefs, saveGlWorkVoicePrefs } from './glwork-voice-prefs'
import { setGlWorkVoiceSheetOpen } from './glwork-voice-sheet-state'

/**
 * GL Work's rows in the session header's "…" sheet: switch between hold-to-talk and the keyboard
 * in one tap, and 语音设置 for the recognizer and read-aloud choices.
 */
export function glWorkVoiceSheetActions(): ActionSheetAction[] {
  if (!isGlWorkApp()) {
    return []
  }
  const voice = currentGlWorkVoicePrefs().inputMode === 'voice'
  return [
    {
      label: voice ? '输入方式：语音' : '输入方式：键盘',
      hint: voice ? '点一下换成键盘输入' : '点一下换成按住说话',
      icon: voice ? Mic : Keyboard,
      onPress: () =>
        void saveGlWorkVoicePrefs((prefs) => ({
          ...prefs,
          inputMode: voice ? 'keyboard' : 'voice'
        }))
    },
    {
      label: '语音设置',
      hint: '语音识别和语音播报',
      icon: AudioLines,
      closeBeforePress: true,
      onPress: () => setGlWorkVoiceSheetOpen(true)
    }
  ]
}

/** GL Work always offers the header's "…" button, since it carries the voice rows. */
export function glWorkShowsHeaderMoreButton(): boolean {
  return isGlWorkApp()
}

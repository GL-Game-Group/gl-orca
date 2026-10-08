import { AudioLines } from 'lucide-react-native'
import type { ActionSheetAction } from '../../../components/ActionSheetModal'
import { isGlWorkApp } from '../glwork-app'
import { setGlWorkVoiceSheetOpen } from './glwork-voice-sheet-state'

/** "语音" in the session header's "…" sheet, in GL Work builds: the quick voice settings. */
export function glWorkVoiceSheetActions(): ActionSheetAction[] {
  if (!isGlWorkApp()) {
    return []
  }
  return [
    {
      label: '语音',
      hint: '语音识别和语音播报',
      icon: AudioLines,
      closeBeforePress: true,
      onPress: () => setGlWorkVoiceSheetOpen(true)
    }
  ]
}

/** GL Work always offers the header's "…" button, since it carries the voice settings. */
export function glWorkShowsHeaderMoreButton(): boolean {
  return isGlWorkApp()
}

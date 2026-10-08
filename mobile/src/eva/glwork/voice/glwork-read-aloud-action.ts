import { Alert } from 'react-native'
import { Volume2 } from 'lucide-react-native'
import type { ActionSheetAction } from '../../../components/ActionSheetModal'
import { isGlWorkApp } from '../glwork-app'
import { speakGlWorkReply } from './glwork-voice-lazy'

/** "朗读" in a chat message's long-press sheet, in GL Work builds; reads with the voice from Settings → Voice. */
export function glWorkReadAloudActions(text: string): ActionSheetAction[] {
  if (!isGlWorkApp()) {
    return []
  }
  return [
    {
      label: '朗读',
      icon: Volume2,
      disabled: text.trim().length === 0,
      onPress: () => {
        void speakGlWorkReply(text).catch((error: unknown) => {
          Alert.alert('无法朗读', error instanceof Error ? error.message : String(error))
        })
      }
    }
  ]
}

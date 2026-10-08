import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { BottomDrawer } from '../../../components/BottomDrawer'
import { voiceSettingsStyles as styles } from '../../../settings/voice-settings-styles'
import { isGlWorkApp } from '../glwork-app'
import { GlWorkRecognitionRows, GlWorkSpeechSettings } from './GlWorkVoiceSettings'
import {
  isGlWorkVoiceSheetOpen,
  setGlWorkVoiceSheetOpen,
  subscribeGlWorkVoiceSheet
} from './glwork-voice-sheet-state'

/** 语音设置 from the session's "…": recognizer and read-aloud; the full page stays in Settings → Voice. */
export function GlWorkVoiceQuickSheet() {
  const [open, setOpen] = useState(isGlWorkVoiceSheetOpen)
  useEffect(() => subscribeGlWorkVoiceSheet(setOpen), [])
  if (!isGlWorkApp()) {
    return null
  }
  return (
    <BottomDrawer visible={open} onClose={() => setGlWorkVoiceSheetOpen(false)}>
      {open ? (
        <View>
          <Text style={styles.heading}>语音设置</Text>
          <Text style={[styles.groupHeading, styles.inputGroupGap]}>语音识别</Text>
          <GlWorkRecognitionRows desktop />
          <GlWorkSpeechSettings />
        </View>
      ) : null}
    </BottomDrawer>
  )
}

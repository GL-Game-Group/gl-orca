import { useEffect, useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { RotateCcw, Square } from 'lucide-react-native'
import { colors } from '../../../theme/mobile-theme'
import { alertSpeechFailure } from './glwork-speech-alert'
import {
  glWorkLastSpoken,
  isGlWorkSpeaking,
  stopGlWorkSpeech,
  subscribeGlWorkLastSpoken,
  subscribeGlWorkSpeaking
} from './glwork-speech-state'
import { speakGlWorkReply } from './glwork-voice-lazy'

/** Voice mode's small read-aloud button: 停止 while reading, otherwise 重播 the last reading. */
export function GlWorkSpeechControl() {
  const [speaking, setSpeaking] = useState(isGlWorkSpeaking)
  const [last, setLast] = useState(glWorkLastSpoken)
  useEffect(() => subscribeGlWorkSpeaking(setSpeaking), [])
  useEffect(() => subscribeGlWorkLastSpoken(setLast), [])

  if (speaking) {
    return (
      <Pressable
        accessibilityLabel="停止朗读"
        hitSlop={8}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={stopGlWorkSpeech}
      >
        <Square size={13} color={colors.statusRed} fill={colors.statusRed} strokeWidth={2.4} />
      </Pressable>
    )
  }
  return (
    <Pressable
      accessibilityLabel="重播最近一次朗读"
      hitSlop={8}
      disabled={!last}
      style={({ pressed }) => [styles.button, !last && styles.disabled, pressed && styles.pressed]}
      onPress={() => {
        if (last) {
          void speakGlWorkReply(last).catch(alertSpeechFailure)
        }
      }}
    >
      <RotateCcw size={14} color={colors.textSecondary} strokeWidth={2.2} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end'
  },
  disabled: {
    opacity: 0.35
  },
  pressed: {
    opacity: 0.6
  }
})

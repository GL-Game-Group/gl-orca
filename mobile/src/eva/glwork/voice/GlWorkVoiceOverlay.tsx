import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radii, spacing, typography } from '../../../theme/mobile-theme'
import type { MobileNativeChatController } from '../../../session/mobile-native-chat-controller-contract'
import { nativeChatMessagePlainText } from '../../../session/mobile-native-chat-message-plain-text'
import { isGlWorkApp } from '../glwork-app'
import { glWorkDictationLive, subscribeGlWorkDictationLive } from './glwork-dictation-live'
import { isGlWorkSpeaking, stopGlWorkSpeech, subscribeGlWorkSpeaking } from './glwork-speech-state'
import { alertSpeechFailure } from './glwork-speech-alert'
import { speakGlWorkReply } from './glwork-voice-lazy'
import { currentGlWorkVoicePrefs, loadGlWorkVoicePrefs } from './glwork-voice-prefs'

/** Reads the last reply when an agent's turn ends in chat view, if Settings → Voice says so. */
function useAutoRead(chat: MobileNativeChatController): void {
  const wasWorking = useRef(chat.nativeChatAgentWorking)
  const lastRead = useRef<string | null>(null)

  useEffect(() => {
    void loadGlWorkVoicePrefs()
  }, [])

  useEffect(() => {
    const ended = wasWorking.current && !chat.nativeChatAgentWorking
    wasWorking.current = chat.nativeChatAgentWorking
    if (!ended || !chat.showNativeChat || !currentGlWorkVoicePrefs().tts.autoRead) {
      return
    }
    const reply = chat.nativeChatSession.messages.findLast((m) => m.role === 'assistant')
    if (!reply || reply.id === lastRead.current) {
      return
    }
    lastRead.current = reply.id
    void speakGlWorkReply(nativeChatMessagePlainText(reply)).catch(alertSpeechFailure)
  }, [chat.nativeChatAgentWorking, chat.showNativeChat, chat.nativeChatSession.messages])
}

/**
 * GL Work's voice over a session: the words a cloud recognizer has so far while dictating, a bar to
 * stop a reading, and automatic reading of finished replies. Nothing in Orca's own builds.
 */
export function GlWorkVoiceOverlay({ chat }: { chat: MobileNativeChatController | undefined }) {
  return isGlWorkApp() && chat ? <VoiceOverlay chat={chat} /> : null
}

function VoiceOverlay({ chat }: { chat: MobileNativeChatController }) {
  const [live, setLive] = useState(glWorkDictationLive)
  const [speaking, setSpeaking] = useState(isGlWorkSpeaking)

  useEffect(() => subscribeGlWorkDictationLive(setLive), [])
  useEffect(() => subscribeGlWorkSpeaking(setSpeaking), [])
  useAutoRead(chat)

  if (!live && !speaking) {
    return null
  }
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {live ? (
        <View style={styles.live}>
          <Text style={styles.liveText}>{live}</Text>
        </View>
      ) : null}
      {speaking ? (
        <Pressable style={styles.speaking} onPress={stopGlWorkSpeech}>
          <Text style={styles.speakingText}>正在朗读 · 点这里停止</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center'
  },
  live: {
    alignSelf: 'stretch',
    padding: spacing.md,
    borderRadius: radii.input,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.borderSubtle
  },
  liveText: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    lineHeight: 20
  },
  speaking: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.borderSubtle
  },
  speakingText: {
    color: colors.textSecondary,
    fontSize: typography.bodySize
  }
})

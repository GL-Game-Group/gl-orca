import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { Check, Play } from 'lucide-react-native'
import { voiceSettingsStyles as styles } from '../../../settings/voice-settings-styles'
import { colors } from '../../../theme/mobile-theme'
import { isGlWorkApp } from '../glwork-app'
import { alertSpeechFailure } from './glwork-speech-alert'
import { effectiveSpeechChoice, speechChoiceProblem } from './glwork-speech-choice'
import { stopGlWorkSpeech } from './glwork-speech-state'
import { recognitionOptions, speechOptions } from './glwork-voice-options'
import { previewVoice, speakWith } from './glwork-voice-lazy'
import { saveGlWorkVoicePrefs } from './glwork-voice-prefs'
import {
  useGlWorkVoicePrefs,
  useGlWorkVoiceVendors,
  type GlWorkVoiceVendors
} from './use-glwork-voice-settings'

function vendorsNote(vendors: GlWorkVoiceVendors): string | null {
  switch (vendors.state) {
    case 'loading':
      return '正在读取公司开放的语音服务…'
    case 'signed-out':
      return '登录公司账号后，可以用千问、火山。'
    case 'error':
      return vendors.message
    case 'ready':
      return vendors.vendors.length === 0 ? '管理员还没有为你开放语音服务。' : null
  }
}

function SelectRow(props: {
  label: string
  sublabel?: string
  selected: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      disabled={props.disabled}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={props.onPress}
    >
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, props.disabled && local.muted]}>{props.label}</Text>
        {props.sublabel ? <Text style={styles.rowSublabel}>{props.sublabel}</Text> : null}
      </View>
      {props.selected ? <Check size={18} color={colors.textPrimary} /> : null}
    </Pressable>
  )
}

/**
 * The recognizers: 千问实时, 千问识别, 火山实时, 火山识别 as the company opens them, and with
 * `desktop` Orca's own (the desktop's dictation model) first.
 */
export function GlWorkRecognitionRows({
  desktop,
  onPicked
}: {
  desktop?: boolean
  onPicked?: () => void
}) {
  const prefs = useGlWorkVoicePrefs()
  const vendors = useGlWorkVoiceVendors()
  const note = vendorsNote(vendors)
  const options = vendors.state === 'ready' ? recognitionOptions(vendors.vendors) : []
  const pick = (asrVendor: string | null, asrKind: 'realtime' | 'file' = 'realtime'): void => {
    void saveGlWorkVoicePrefs((p) => ({ ...p, asrVendor, asrKind }))
    onPicked?.()
  }
  return (
    <View style={[styles.section, styles.sectionTopGap]}>
      {desktop ? (
        <SelectRow
          label="电脑上的模型"
          sublabel="Orca 原有方式：电脑识别，说完才出字（键盘模式的麦克风；按住说话用云端识别）"
          selected={prefs.asrVendor === null}
          onPress={() => pick(null)}
        />
      ) : null}
      {note ? <Text style={styles.emptyText}>{note}</Text> : null}
      {options.map((option) => (
        <SelectRow
          key={`${option.vendor.id}-${option.kind}`}
          label={option.label}
          sublabel={`${option.kind === 'realtime' ? '边说边出字' : '说完后整段识别'} · ${option.model}`}
          selected={prefs.asrVendor === option.vendor.id && prefs.asrKind === option.kind}
          onPress={() => pick(option.vendor.id, option.kind)}
        />
      ))}
    </View>
  )
}

/** Company cloud recognizers, listed above the desktop's models in the speech model drawer. */
export function GlWorkCloudAsrList({ onPicked }: { onPicked: () => void }) {
  if (!isGlWorkApp()) {
    return null
  }
  return (
    <View>
      <Text style={styles.groupHeading}>公司云端（手机直连）</Text>
      <GlWorkRecognitionRows onPicked={onPicked} />
      <Text style={[styles.groupHeading, styles.inputGroupGap]}>电脑上的模型</Text>
    </View>
  )
}

const RATES = [
  { label: '慢', value: -30 },
  { label: '正常', value: 0 },
  { label: '快', value: 40 }
]

/** 语音播报: 千问实时, 千问语音, 火山实时, 火山语音, then the chosen one's voices. */
export function GlWorkSpeechSettings() {
  const prefs = useGlWorkVoicePrefs()
  const vendors = useGlWorkVoiceVendors()
  if (!isGlWorkApp()) {
    return null
  }
  const note = vendorsNote(vendors)
  const all = vendors.state === 'ready' ? vendors.vendors : []
  const options = speechOptions(all)
  const choice = effectiveSpeechChoice(prefs, all)
  const option = choice.option
  const problem = vendors.state === 'ready' && !note ? speechChoiceProblem(choice, all) : null
  const save = (change: Partial<typeof prefs.tts>): void => {
    void saveGlWorkVoicePrefs((p) => ({ ...p, tts: { ...p.tts, ...change } }))
  }
  const preview = (voice: { id: string; name: string; sampleUrl: string | null }): void => {
    stopGlWorkSpeech()
    const play = voice.sampleUrl
      ? previewVoice(voice.sampleUrl)
      : option
        ? speakWith({ option, voice: voice.id, rate: prefs.tts.rate }, `你好，我是${voice.name}。`)
        : Promise.resolve()
    void play.catch(alertSpeechFailure)
  }

  return (
    <View>
      <Text style={[styles.groupHeading, styles.inputGroupGap]}>语音播报</Text>
      <View style={[styles.section, styles.sectionTopGap]}>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>自动朗读回复</Text>
            <Text style={styles.rowSublabel}>
              聊天视图里，代理回复完自动朗读；也可以长按消息选“朗读”。回复内容会发给所选的语音厂商。
            </Text>
          </View>
          <Switch
            value={prefs.tts.autoRead}
            onValueChange={(autoRead) => save({ autoRead })}
            trackColor={{ false: colors.bgRaised, true: colors.textSecondary }}
            thumbColor={colors.textPrimary}
          />
        </View>
        {note || problem ? <Text style={styles.emptyText}>{note ?? problem}</Text> : null}
        {options.map((entry) => (
          <SelectRow
            key={`${entry.vendor.id}-${entry.kind}`}
            label={entry.label}
            sublabel={`${entry.kind === 'stream' ? '边合成边播，开口快' : '整段合成后播放'} · ${entry.model}`}
            selected={option === entry}
            onPress={() =>
              save({
                vendor: entry.vendor.id,
                kind: entry.kind,
                voice: entry.voices[0]?.id ?? null
              })
            }
          />
        ))}
      </View>
      {option ? (
        <View style={[styles.section, styles.sectionTopGap]}>
          {option.vendor.protocol === 'volcengine' ? (
            <View style={styles.row}>
              <Text style={[styles.rowLabel, styles.rowContent]}>语速</Text>
              <View style={styles.segmented}>
                {RATES.map((rate) => (
                  <Pressable
                    key={rate.value}
                    onPress={() => save({ rate: rate.value })}
                    style={[styles.segment, prefs.tts.rate === rate.value && styles.segmentActive]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        prefs.tts.rate === rate.value && styles.segmentTextActive
                      ]}
                    >
                      {rate.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {option.voices.map((voice) => (
            <Pressable
              key={voice.id}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => save({ vendor: option.vendor.id, kind: option.kind, voice: voice.id })}
            >
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>{voice.name}</Text>
                {voice.description ? (
                  <Text style={styles.rowSublabel} numberOfLines={1}>
                    {voice.description}
                  </Text>
                ) : null}
              </View>
              <Pressable
                hitSlop={10}
                onPress={() => preview(voice)}
                accessibilityLabel={`试听 ${voice.name}`}
              >
                <Play size={18} color={colors.textSecondary} />
              </Pressable>
              {choice.voice?.id === voice.id ? (
                <Check size={18} color={colors.textPrimary} />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const local = StyleSheet.create({
  muted: { color: colors.textMuted }
})

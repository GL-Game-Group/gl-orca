import { Pressable, Switch, Text, View } from 'react-native'
import { Check, Play } from 'lucide-react-native'
import { voiceSettingsStyles as styles } from '../../../settings/voice-settings-styles'
import { colors } from '../../../theme/mobile-theme'
import { isGlWorkApp } from '../glwork-app'
import { stopGlWorkSpeech } from './glwork-speech-state'
import { alertSpeechFailure } from './glwork-speech-alert'
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

/** Company cloud recognizers, listed above the desktop's models in the speech model drawer. */
export function GlWorkCloudAsrList({ onPicked }: { onPicked: () => void }) {
  const prefs = useGlWorkVoicePrefs()
  const vendors = useGlWorkVoiceVendors()
  if (!isGlWorkApp()) {
    return null
  }
  const note = vendorsNote(vendors)
  const asr = vendors.state === 'ready' ? vendors.vendors.filter((vendor) => vendor.asr) : []
  return (
    <View>
      <Text style={styles.groupHeading}>公司云端（手机直连，边说边出字）</Text>
      <View style={[styles.section, styles.sectionTopGap]}>
        {note ? <Text style={styles.emptyText}>{note}</Text> : null}
        {asr.map((vendor) => (
          <Pressable
            key={vendor.id}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => {
              void saveGlWorkVoicePrefs((p) => ({ ...p, asrVendor: vendor.id }))
              onPicked()
            }}
          >
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>{vendor.name}</Text>
              <Text style={styles.rowSublabel}>{vendor.asr?.model}</Text>
            </View>
            {prefs.asrVendor === vendor.id ? <Check size={18} color={colors.textPrimary} /> : null}
          </Pressable>
        ))}
      </View>
      <Text style={[styles.groupHeading, styles.inputGroupGap]}>电脑上的模型</Text>
    </View>
  )
}

const RATES = [
  { label: '慢', value: -30 },
  { label: '正常', value: 0 },
  { label: '快', value: 40 }
]

/** 语音播报: read replies aloud with a company vendor's voice. */
export function GlWorkSpeechSettings() {
  const prefs = useGlWorkVoicePrefs()
  const vendors = useGlWorkVoiceVendors()
  if (!isGlWorkApp()) {
    return null
  }
  const note = vendorsNote(vendors)
  const tts = vendors.state === 'ready' ? vendors.vendors.filter((vendor) => vendor.tts) : []
  const vendor = tts.find((entry) => entry.id === prefs.tts.vendor) ?? null
  const save = (change: Partial<typeof prefs.tts>): void => {
    void saveGlWorkVoicePrefs((p) => ({ ...p, tts: { ...p.tts, ...change } }))
  }
  const preview = (voice: { id: string; name: string; sampleUrl: string | null }): void => {
    stopGlWorkSpeech()
    const play = voice.sampleUrl
      ? previewVoice(voice.sampleUrl)
      : vendor
        ? speakWith({ vendor, voice: voice.id, rate: prefs.tts.rate }, `你好，我是${voice.name}。`)
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
        <View style={styles.separator} />
        {note ? <Text style={styles.emptyText}>{note}</Text> : null}
        {tts.length > 0 ? (
          <View style={styles.row}>
            <Text style={[styles.rowLabel, styles.rowContent]}>播报厂商</Text>
            <View style={styles.segmented}>
              {tts.map((entry) => (
                <Pressable
                  key={entry.id}
                  onPress={() =>
                    save({ vendor: entry.id, voice: entry.tts?.voices[0]?.id ?? null })
                  }
                  style={[styles.segment, vendor?.id === entry.id && styles.segmentActive]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      vendor?.id === entry.id && styles.segmentTextActive
                    ]}
                  >
                    {entry.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {vendor?.protocol === 'volcengine' ? (
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
        {(vendor?.tts?.voices ?? []).map((voice) => (
          <Pressable
            key={voice.id}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => save({ voice: voice.id })}
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
            {prefs.tts.voice === voice.id ? <Check size={18} color={colors.textPrimary} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  )
}

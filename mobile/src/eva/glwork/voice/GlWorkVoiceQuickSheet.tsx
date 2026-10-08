import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { BottomDrawer } from '../../../components/BottomDrawer'
import { voiceSettingsStyles as styles } from '../../../settings/voice-settings-styles'
import { colors } from '../../../theme/mobile-theme'
import { isGlWorkApp } from '../glwork-app'
import { GlWorkSpeechSettings } from './GlWorkVoiceSettings'
import { saveGlWorkVoicePrefs } from './glwork-voice-prefs'
import {
  isGlWorkVoiceSheetOpen,
  setGlWorkVoiceSheetOpen,
  subscribeGlWorkVoiceSheet
} from './glwork-voice-sheet-state'
import { useGlWorkVoicePrefs, useGlWorkVoiceVendors } from './use-glwork-voice-settings'

/** Which recognizer the mic uses: the desktop's own dictation, or a company vendor. */
function QuickAsrPicker() {
  const prefs = useGlWorkVoicePrefs()
  const vendors = useGlWorkVoiceVendors()
  const asr = vendors.state === 'ready' ? vendors.vendors.filter((vendor) => vendor.asr) : []
  const rows = [
    { id: null, label: '电脑上的模型', sublabel: '由电脑识别（Orca 原有方式）' },
    ...asr.map((vendor) => ({
      id: vendor.id,
      label: vendor.name,
      sublabel: `手机直连，边说边出字 · ${vendor.asr?.model ?? ''}`
    }))
  ]
  return (
    <View>
      <Text style={styles.groupHeading}>语音识别</Text>
      <View style={[styles.section, styles.sectionTopGap]}>
        {rows.map((row) => (
          <Pressable
            key={row.id ?? 'desktop'}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => void saveGlWorkVoicePrefs((p) => ({ ...p, asrVendor: row.id }))}
          >
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowSublabel}>{row.sublabel}</Text>
            </View>
            {prefs.asrVendor === row.id ? <Check size={18} color={colors.textPrimary} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  )
}

/** The session screen's quick voice settings; the full ones stay in Settings → Voice. */
export function GlWorkVoiceQuickSheet() {
  const [open, setOpen] = useState(isGlWorkVoiceSheetOpen)
  useEffect(() => subscribeGlWorkVoiceSheet(setOpen), [])
  if (!isGlWorkApp()) {
    return null
  }
  return (
    <BottomDrawer visible={open} onClose={() => setGlWorkVoiceSheetOpen(false)}>
      <View>
        <Text style={styles.heading}>语音</Text>
        <View style={styles.sectionTopGap} />
        {open ? <QuickAsrPicker /> : null}
        {open ? <GlWorkSpeechSettings /> : null}
      </View>
    </BottomDrawer>
  )
}

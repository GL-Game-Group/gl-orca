import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from 'react-native'
import { ImagePlus } from 'lucide-react-native'
import { triggerMediumImpact, triggerSelection } from '../../../platform/haptics'
import { colors, radii, spacing, typography } from '../../../theme/mobile-theme'
import {
  MobileNativeChatSessionOptionPickers,
  type MobileNativeChatSessionOptionPickersProps
} from '../../../session/MobileNativeChatSessionOptionPickers'
import {
  HOLD_TO_TALK_MIN_MS,
  holdToTalkRelease,
  holdToTalkZone,
  type HoldToTalkZone
} from './glwork-hold-to-talk-gesture'
import { GlWorkSpeechControl } from './GlWorkSpeechControl'
import { useGlWorkHoldToTalk } from './use-glwork-hold-to-talk'

export type GlWorkVoiceBarProps = {
  onAttachImage?: () => void
  /** Images picked for the next send (sent with what is said). */
  attachmentCount: number
  isAttaching: boolean
  sessionOptions?: MobileNativeChatSessionOptionPickersProps | null
  sending: boolean
  /** The chat is locked (e.g. disconnected): holding does nothing. */
  disabled: boolean
  /** Letting go over the button: send what was heard. */
  onSendHeard: (heard: string) => void
  /** Slid right: edit what was heard with the keyboard. */
  onEditHeard: (heard: string) => void
}

const NOTICE_MS = 3000

/** Voice mode's input row: attach on the left, hold-to-talk in the middle, model on the right. */
export function GlWorkVoiceBar(props: GlWorkVoiceBarProps) {
  const { width } = useWindowDimensions()
  const [zone, setZone] = useState<HoldToTalkZone>('send')
  const [notice, setNotice] = useState<string | null>(null)
  const talk = useGlWorkHoldToTalk((error) => setNotice(error.message))
  const holding = talk.state !== 'idle'

  useEffect(() => {
    if (!notice) {
      return
    }
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  // The responder is made once; it reads the latest props and state through this ref.
  const live = useRef({ props, talk, width, zone, pressedAt: 0 })
  live.current = { ...live.current, props, talk, width, zone }

  const responder = useMemo(() => {
    // Touch timestamps (ms), not the clock: the hold's length comes from the touch itself.
    const letGo = async (releasedAt: number): Promise<void> => {
      const { talk: current, zone: where, pressedAt } = live.current
      const heldMs = releasedAt - pressedAt
      if (where === 'cancel' || heldMs < HOLD_TO_TALK_MIN_MS) {
        current.cancel()
        if (where !== 'cancel') {
          setNotice('按住说话，说完再松开')
        }
        return
      }
      const outcome = holdToTalkRelease(where, heldMs, await current.finish())
      if (outcome.kind === 'send') {
        live.current.props.onSendHeard(outcome.text)
      } else if (outcome.kind === 'edit') {
        live.current.props.onEditHeard(outcome.text)
      } else if (outcome.kind === 'empty') {
        setNotice('没有听到内容')
      }
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !live.current.props.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        live.current.pressedAt = event.nativeEvent.timestamp
        live.current.zone = 'send'
        setZone('send')
        setNotice(null)
        triggerMediumImpact()
        void live.current.talk.start()
      },
      onPanResponderMove: (_event, gesture) => {
        const next = holdToTalkZone(gesture.dx, live.current.width)
        if (next !== live.current.zone) {
          live.current.zone = next
          setZone(next)
          triggerSelection()
        }
      },
      onPanResponderRelease: (event) => void letGo(event.nativeEvent.timestamp),
      onPanResponderTerminate: () => live.current.talk.cancel()
    })
  }, [])

  return (
    <View style={styles.inset}>
      {holding ? (
        <HoldCard zone={zone} text={talk.text} state={talk.state} live={talk.live} />
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {props.attachmentCount > 0 && !holding ? (
        <Text style={styles.notice}>已添加 {props.attachmentCount} 张图片，会和语音一起发送</Text>
      ) : null}
      <View style={styles.row}>
        {props.onAttachImage ? (
          <Pressable
            accessibilityLabel="添加图片"
            style={({ pressed }) => [styles.side, pressed && styles.pressed]}
            onPress={props.onAttachImage}
            disabled={props.isAttaching || props.disabled}
          >
            {props.isAttaching ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <ImagePlus size={22} color={colors.textSecondary} strokeWidth={2} />
            )}
          </Pressable>
        ) : null}
        <View
          {...responder.panHandlers}
          accessibilityRole="button"
          accessibilityLabel="按住说话"
          style={[styles.hold, holding && styles.holdActive, props.disabled && styles.holdDisabled]}
        >
          {props.sending || talk.state === 'finishing' ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text style={[styles.holdText, holding && styles.holdTextActive]}>
              {holding ? '松开 发送' : '按住 说话'}
            </Text>
          )}
        </View>
        <View style={styles.right}>
          <GlWorkSpeechControl />
          {props.sessionOptions ? (
            <MobileNativeChatSessionOptionPickers
              {...props.sessionOptions}
              sendInFlight={props.sending}
            />
          ) : null}
        </View>
      </View>
    </View>
  )
}

function HoldCard({
  zone,
  text,
  state,
  live
}: {
  zone: HoldToTalkZone
  text: string
  state: string
  live: boolean
}) {
  const hint = zone === 'cancel' ? '松开 取消' : zone === 'edit' ? '松开 编辑文字' : '松开 发送'
  return (
    <View style={styles.card} pointerEvents="none">
      <Text style={styles.cardText}>
        {text ||
          (state === 'starting'
            ? '正在连接…'
            : state === 'finishing'
              ? '正在识别…'
              : live
                ? '正在听…'
                : '正在听…（松开后识别）')}
      </Text>
      <View style={styles.zones}>
        <Text style={[styles.zone, zone === 'cancel' && styles.zoneCancel]}>← 取消</Text>
        <Text style={styles.cardHint}>{hint}</Text>
        <Text style={[styles.zone, zone === 'edit' && styles.zoneEdit]}>编辑 →</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Orca's composer inset, so switching modes does not move the transcript.
  inset: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.card,
    backgroundColor: colors.bgPanel
  },
  right: {
    alignItems: 'flex-end',
    gap: 2
  },
  side: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  hold: {
    flex: 1,
    height: 44,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgRaised
  },
  holdActive: {
    backgroundColor: colors.accentBlue
  },
  holdDisabled: {
    opacity: 0.5
  },
  holdText: {
    fontSize: typography.bodySize,
    fontWeight: '600',
    color: colors.textPrimary
  },
  holdTextActive: {
    color: colors.onAccent
  },
  pressed: {
    opacity: 0.7
  },
  notice: {
    fontSize: typography.metaSize,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs
  },
  card: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgRaised,
    gap: spacing.sm
  },
  cardText: {
    fontSize: typography.bodySize,
    color: colors.textPrimary,
    minHeight: 22
  },
  cardHint: {
    fontSize: typography.metaSize,
    color: colors.textSecondary
  },
  zones: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  zone: {
    fontSize: typography.metaSize,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.button,
    overflow: 'hidden'
  },
  zoneCancel: {
    color: colors.onAccent,
    backgroundColor: colors.statusRed
  },
  zoneEdit: {
    color: colors.onAccent,
    backgroundColor: colors.accentBlue
  }
})

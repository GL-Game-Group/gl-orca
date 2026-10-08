import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'
import type { MobileNativeChatController } from '../../session/mobile-native-chat-controller-contract'

/** Long enough for a freshly started agent to report its session through the hooks. */
const WAIT_MS = 8_000

/**
 * The chat view learns a terminal agent's session only from the desktop's agent status hooks,
 * which GL Work leaves off until the member agrees. Without them the chat would stay empty for
 * good; after a short wait this says why and offers the terminal, which shows the agent anyway.
 */
export function GlWorkChatWaitingHint({ controller }: { controller: MobileNativeChatController }) {
  const waiting =
    controller.nativeChatSession.status === 'waiting-session' && !controller.nativeChatStructured
  const tabId = controller.nativeChatTabId
  const [overdue, setOverdue] = useState(false)

  useEffect(() => {
    setOverdue(false)
    if (!waiting) {
      return
    }
    const timer = setTimeout(() => setOverdue(true), WAIT_MS)
    return () => clearTimeout(timer)
  }, [waiting, tabId])

  if (!waiting || !overdue || !tabId) {
    return null
  }
  return (
    <View style={styles.card} pointerEvents="box-none">
      <Text style={styles.text}>
        电脑上的 GL Work
        没有开启代理状态，聊天视图拿不到这个会话。可以切换到终端查看，或在电脑上打开「设置 →
        公司账号 → 手机远程」下的“开启…”。
      </Text>
      <Pressable style={styles.button} onPress={() => controller.toggleTabChatView(tabId)}>
        <Text style={styles.buttonText}>切换到终端</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: spacing.lg,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.input,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.borderSubtle
  },
  text: {
    color: colors.textSecondary,
    fontSize: typography.bodySize,
    lineHeight: 20
  },
  button: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.input,
    backgroundColor: colors.textPrimary
  },
  buttonText: {
    color: colors.bgBase,
    fontSize: typography.bodySize,
    fontWeight: '600'
  }
})

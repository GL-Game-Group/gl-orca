import { useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Globe } from 'lucide-react-native'
import Svg, { Path } from 'react-native-svg'
import { OrcaLogo } from '../components/OrcaLogo'
import { GithubIcon } from '../components/GithubIcon'
import { colors, spacing, typography } from '../theme/mobile-theme'

function XIcon({ size = 16, color = colors.textSecondary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </Svg>
  )
}

export default function AboutScreen({
  onBack,
  openExternal,
  versionLabel
}: {
  onBack: () => void
  openExternal: (url: string) => Promise<unknown>
  versionLabel: string
}) {
  const [error, setError] = useState<string | null>(null)
  const openLink = (url: string) => {
    setError(null)
    void openExternal(url).catch(() => setError('Could not open the link. Try again.'))
  }
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.topRow}>
        <Pressable
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
        >
          <ChevronLeft size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.heading}>About</Text>
      </View>

      <View style={styles.brand}>
        <OrcaLogo size={28} />
        <Text style={styles.brandName}>Orca</Text>
        <Text style={styles.brandSub}>Open-source agent IDE for 100x builders</Text>
      </View>

      <View style={styles.section}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel="Orca website"
          onPress={() => openLink('https://onOrca.dev')}
        >
          <Globe size={16} color={colors.textSecondary} />
          <Text style={styles.rowValue}>onOrca.dev</Text>
        </Pressable>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel="Orca source code"
          onPress={() => openLink('https://github.com/stablyai/orca')}
        >
          <GithubIcon />
          <Text style={styles.rowValue}>stablyai/orca</Text>
        </Pressable>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel="Orca on X"
          onPress={() => openLink('https://x.com/orca_build')}
        >
          <XIcon />
          <Text style={styles.rowValue}>@orca_build</Text>
        </Pressable>
      </View>

      <Text style={styles.versionText}>{versionLabel}</Text>
      {error && (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {error}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
    padding: spacing.lg
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary
  },
  brand: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg
  },
  brandName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.sm
  },
  brandSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xs
  },
  section: {
    backgroundColor: colors.bgPanel,
    borderRadius: 12,
    overflow: 'hidden'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2
  },
  rowPressed: {
    backgroundColor: colors.bgRaised
  },
  rowLabel: {
    flex: 1,
    fontSize: typography.bodySize,
    fontWeight: '500',
    color: colors.textPrimary
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: typography.bodySize,
    color: colors.textSecondary
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: spacing.md
  },
  versionText: {
    marginTop: spacing.lg,
    textAlign: 'center',
    fontSize: typography.metaSize,
    color: colors.textMuted
  },
  errorText: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: typography.metaSize,
    color: colors.statusRed
  }
})

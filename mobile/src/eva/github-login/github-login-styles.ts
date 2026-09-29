import { Platform, StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'
import { TEXT_INPUT_FONT_SIZE } from '../../platform/text-input-font-size'

export const githubLoginStyles = StyleSheet.create({
  input: {
    alignSelf: 'stretch',
    backgroundColor: colors.bgRaised,
    color: colors.textPrimary,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
    fontSize: TEXT_INPUT_FONT_SIZE,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.md
  },
  errorText: {
    color: colors.statusRed,
    fontSize: typography.bodySize,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md
  },
  userCode: {
    color: colors.textPrimary,
    fontFamily: typography.monoFamily,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 4,
    marginVertical: spacing.xl
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.md
  },
  waitingText: {
    color: colors.textSecondary,
    fontSize: typography.bodySize
  }
})

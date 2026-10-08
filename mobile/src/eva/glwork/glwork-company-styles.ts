import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'

export const glworkCompanyStyles = StyleSheet.create({
  list: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginVertical: spacing.lg
  },
  host: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  hostPressed: {
    opacity: 0.7
  },
  hostText: {
    flex: 1,
    gap: 2
  },
  hostName: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600'
  },
  hostState: {
    color: colors.textSecondary,
    fontSize: 13
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  online: {
    backgroundColor: colors.statusGreen
  },
  offline: {
    backgroundColor: colors.textMuted
  },
  empty: {
    color: colors.textSecondary,
    fontSize: typography.bodySize,
    textAlign: 'center',
    lineHeight: 20
  }
})

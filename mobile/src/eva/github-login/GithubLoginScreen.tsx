import { useCallback, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import Constants from 'expo-constants'
import { ChevronLeft } from 'lucide-react-native'
import { colors } from '../../theme/mobile-theme'
import { GithubIcon } from '../../components/GithubIcon'
import { pairScanStyles } from '../../pair-scan-styles'
import { useClipboardWriter } from '../../platform/clipboard'
import { openExternalLink } from '../../platform/external-link'
import { loadGithubLoginServer } from './github-login-server-preference'
import { githubLoginStyles as styles } from './github-login-styles'
import { useGithubDeviceLogin } from './use-github-device-login'

function currentDeviceName(): string {
  const name = Constants.deviceName?.trim()
  return (name || (Platform.OS === 'ios' ? 'iPhone' : 'Android')).slice(0, 64)
}

export function GithubLoginScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const clipboard = useClipboardWriter()
  const [server, setServer] = useState('')
  const [copied, setCopied] = useState(false)
  // Why: hand off to the existing confirm screen so pairing, E2EE and reconnect stay upstream code.
  const onPaired = useCallback(
    (pairingUrl: string) =>
      router.replace({ pathname: '/pair-confirm', params: { code: pairingUrl } }),
    [router]
  )
  const { state, start, cancel, dispose } = useGithubDeviceLogin(currentDeviceName(), onPaired)

  useFocusEffect(
    useCallback(() => {
      let disposed = false
      void loadGithubLoginServer().then((saved) => {
        if (!disposed) {
          setServer((current) => current || saved)
        }
      })
      return () => {
        disposed = true
      }
    }, [])
  )

  const setRootRef = useCallback(
    (node: View | null) => {
      // Why: an in-flight poll must not outlive the screen that shows its code.
      if (node === null) {
        dispose()
      }
    },
    [dispose]
  )

  const openGithub = (userCode: string, verificationUri: string) => {
    void clipboard
      .writeText(userCode)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
      .finally(() => openExternalLink(verificationUri))
  }

  const containerPadding = { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }

  return (
    <View ref={setRootRef} style={[pairScanStyles.container, containerPadding]}>
      <Pressable
        style={pairScanStyles.backButton}
        onPress={() => {
          cancel()
          router.back()
        }}
      >
        <ChevronLeft size={22} color={colors.textSecondary} />
      </Pressable>

      {(state.kind === 'idle' || state.kind === 'error') && (
        <View style={pairScanStyles.centered}>
          <Text style={pairScanStyles.title}>Sign in with GitHub</Text>
          <Text style={pairScanStyles.subtitle}>
            Enter your team's Orca server. Members of its GitHub organization are paired
            automatically.
          </Text>
          <TextInput
            style={styles.input}
            value={server}
            onChangeText={setServer}
            placeholder="https://orca.example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => start(server)}
          />
          {state.kind === 'error' && <Text style={styles.errorText}>{state.message}</Text>}
          <Pressable style={pairScanStyles.primaryButton} onPress={() => start(server)}>
            <GithubIcon size={16} color={colors.bgBase} />
            <Text style={pairScanStyles.primaryButtonText}>Continue with GitHub</Text>
          </Pressable>
        </View>
      )}

      {state.kind === 'starting' && (
        <View style={pairScanStyles.centered}>
          <ActivityIndicator size="large" color={colors.textSecondary} />
        </View>
      )}

      {state.kind === 'awaiting-authorization' && (
        <View style={pairScanStyles.centered}>
          <Text style={pairScanStyles.title}>Enter this code on GitHub</Text>
          <Text selectable style={styles.userCode}>
            {state.userCode}
          </Text>
          <Pressable
            style={pairScanStyles.primaryButton}
            onPress={() => openGithub(state.userCode, state.verificationUri)}
          >
            <GithubIcon size={16} color={colors.bgBase} />
            <Text style={pairScanStyles.primaryButtonText}>
              {copied ? 'Code copied — open GitHub' : 'Copy code and open GitHub'}
            </Text>
          </Pressable>
          <View style={styles.waitingRow}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text style={styles.waitingText}>Waiting for authorization…</Text>
          </View>
          <Pressable style={pairScanStyles.secondaryButton} onPress={cancel}>
            <Text style={pairScanStyles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

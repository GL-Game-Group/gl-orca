import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import Constants from 'expo-constants'
import { ChevronLeft, Monitor } from 'lucide-react-native'
import { colors } from '../../theme/mobile-theme'
import { GithubIcon } from '../../components/GithubIcon'
import { pairScanStyles } from '../../pair-scan-styles'
import { githubLoginStyles } from '../github-login/github-login-styles'
import { loadHosts } from '../../transport/host-store'
import {
  CompanyRequestFailed,
  companyRelayEndpoint,
  listCompanyHosts,
  pairWithCompanyHost,
  signInToCompany,
  signOutOfCompany,
  type CompanyHost
} from './company-client'
import {
  GLWORK_DEFAULT_SERVER,
  clearCompanySession,
  loadCompanySession,
  saveCompanySession,
  type CompanySession
} from './company-session'
import { glworkCompanyStyles as styles } from './glwork-company-styles'

function currentDeviceName(): string {
  const name = Constants.deviceName?.trim()
  return (name || (Platform.OS === 'ios' ? 'iPhone' : 'Android')).slice(0, 64)
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hostState(host: CompanyHost): string {
  if (host.closed) {
    return 'Closed by the administrator'
  }
  return host.online ? 'Online' : 'Offline — open GL Work on it'
}

/**
 * GL Work: sign in to the company with GitHub, pick one of your computers, and pair through the
 * company's relay. The pairing then runs through Orca's own confirm screen and transport.
 */
export function GlWorkCompanyScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [session, setSession] = useState<CompanySession | null | undefined>(undefined)
  const [server, setServer] = useState(GLWORK_DEFAULT_SERVER)
  const [hosts, setHosts] = useState<CompanyHost[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (current: CompanySession) => {
    try {
      setHosts(await listCompanyHosts(current))
      setError(null)
    } catch (failure) {
      if (failure instanceof CompanyRequestFailed && failure.status === 401) {
        await clearCompanySession()
        setSession(null)
      }
      setError(errorText(failure))
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadCompanySession().then((loaded) => {
        setSession(loaded)
        if (loaded) {
          void refresh(loaded)
        }
      })
    }, [refresh])
  )

  const signIn = async (): Promise<void> => {
    setBusy('sign-in')
    setError(null)
    try {
      const signedIn = await signInToCompany(
        server.trim().replace(/\/+$/u, ''),
        currentDeviceName()
      )
      if (signedIn) {
        await saveCompanySession(signedIn)
        setSession(signedIn)
        await refresh(signedIn)
      }
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(null)
    }
  }

  const connect = async (host: CompanyHost): Promise<void> => {
    if (!session) {
      return
    }
    setBusy(host.id)
    setError(null)
    try {
      // Why: each pairing mints a device on the computer; one this phone already holds is opened instead.
      const endpoint = companyRelayEndpoint(session.server, host.id)
      const paired = (await loadHosts()).find((saved) => saved.endpoint === endpoint)
      if (paired) {
        router.replace({ pathname: '/h/[hostId]', params: { hostId: paired.id } })
        return
      }
      const pairingUrl = await pairWithCompanyHost(session, host.id, currentDeviceName())
      // Why: hand off to the existing confirm screen so pairing, E2EE and reconnect stay upstream code.
      router.replace({ pathname: '/pair-confirm', params: { code: pairingUrl } })
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(null)
    }
  }

  const signOut = async (): Promise<void> => {
    if (session) {
      await signOutOfCompany(session)
    }
    await clearCompanySession()
    setSession(null)
    setHosts(null)
  }

  return (
    <View
      style={[
        pairScanStyles.container,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }
      ]}
    >
      <Pressable style={pairScanStyles.backButton} onPress={() => router.back()}>
        <ChevronLeft size={22} color={colors.textSecondary} />
      </Pressable>

      {session === undefined ? (
        <View style={pairScanStyles.centered}>
          <ActivityIndicator size="large" color={colors.textSecondary} />
        </View>
      ) : session === null ? (
        <View style={pairScanStyles.centered}>
          <Text style={pairScanStyles.title}>GL Work</Text>
          <Text style={pairScanStyles.subtitle}>
            Sign in to the company with GitHub to reach your computers running GL Work.
          </Text>
          <TextInput
            style={githubLoginStyles.input}
            value={server}
            onChangeText={setServer}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {error && <Text style={githubLoginStyles.errorText}>{error}</Text>}
          <Pressable
            style={pairScanStyles.primaryButton}
            disabled={busy !== null}
            onPress={() => void signIn()}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.bgBase} />
            ) : (
              <GithubIcon size={16} color={colors.bgBase} />
            )}
            <Text style={pairScanStyles.primaryButtonText}>Sign in with GitHub</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={pairScanStyles.centered}>
          <Text style={pairScanStyles.title}>Your computers</Text>
          <Text style={pairScanStyles.subtitle}>
            Signed in as {session.displayName}. Computers show here once remote access is on in GL
            Work → Settings → Company account.
          </Text>
          <View style={styles.list}>
            {hosts === null ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : hosts.length === 0 ? (
              <Text style={styles.empty}>No computers yet.</Text>
            ) : (
              hosts.map((host) => (
                <Pressable
                  key={host.id}
                  style={({ pressed }) => [styles.host, pressed && styles.hostPressed]}
                  disabled={busy !== null || !host.online || host.closed}
                  onPress={() => void connect(host)}
                >
                  <Monitor size={20} color={colors.textSecondary} />
                  <View style={styles.hostText}>
                    <Text style={styles.hostName}>{host.label}</Text>
                    <Text style={styles.hostState}>{hostState(host)}</Text>
                  </View>
                  {busy === host.id ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : (
                    <View
                      style={[
                        styles.dot,
                        host.online && !host.closed ? styles.online : styles.offline
                      ]}
                    />
                  )}
                </Pressable>
              ))
            )}
          </View>
          {error && <Text style={githubLoginStyles.errorText}>{error}</Text>}
          <Pressable style={pairScanStyles.secondaryButton} onPress={() => void refresh(session)}>
            <Text style={pairScanStyles.secondaryButtonText}>Refresh</Text>
          </Pressable>
          <Pressable style={pairScanStyles.secondaryButton} onPress={() => void signOut()}>
            <Text style={pairScanStyles.secondaryButtonText}>Sign out</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  )
}

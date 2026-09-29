import AsyncStorage from '@react-native-async-storage/async-storage'
import { bundledGithubLoginServer } from '../../storage/preferences'

const LAST_SERVER_KEY = 'orca:githubLoginLastServer'

export async function loadGithubLoginServer(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(LAST_SERVER_KEY)) ?? bundledGithubLoginServer()
  } catch {
    return bundledGithubLoginServer()
  }
}

export async function saveGithubLoginServer(origin: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SERVER_KEY, origin)
  } catch {
    // Remembering the server is a convenience; sign-in must not fail over it.
  }
}

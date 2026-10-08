import { Alert } from 'react-native'

/** Tells the member why a reading failed, instead of the bar just vanishing. */
export function alertSpeechFailure(error: unknown): void {
  Alert.alert('无法朗读', error instanceof Error ? error.message : String(error))
}

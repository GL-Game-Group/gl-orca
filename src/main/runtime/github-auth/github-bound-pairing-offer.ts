// Mints a fresh device bound to a GitHub identity and encodes the same offer a QR scan carries.
// Uses only the server's public getters so the upstream pairing class stays untouched.
import { encodePairingOffer, PAIRING_OFFER_VERSION } from '../../../shared/pairing'
import type { DeviceGithubIdentity, DeviceRegistry, DeviceScope } from '../device-registry'
import { resolveAdvertisedPairingEndpoint } from '../pairing-endpoint'

export type PairingOfferSource = {
  getWebSocketEndpoint(): string | null
  getDeviceRegistry(): DeviceRegistry | null
  getE2EEPublicKey(): string | null
}

export type GithubBoundPairingOffer =
  | { ok: true; pairingUrl: string; deviceId: string }
  | { ok: false; reason: string }

export function createGithubBoundPairingOffer(
  source: PairingOfferSource,
  args: {
    address: string
    deviceName: string
    scope: DeviceScope
    githubIdentity: DeviceGithubIdentity
  }
): GithubBoundPairingOffer {
  const rawEndpoint = source.getWebSocketEndpoint()
  const registry = source.getDeviceRegistry()
  const publicKeyB64 = source.getE2EEPublicKey()
  if (!rawEndpoint || !registry || !publicKeyB64) {
    return { ok: false, reason: 'pairing_unavailable' }
  }
  const advertised = resolveAdvertisedPairingEndpoint(rawEndpoint, args.address)
  if (!advertised.ok) {
    return { ok: false, reason: advertised.reason }
  }
  let deviceId: string
  let deviceToken: string
  try {
    const device = registry.addGithubBoundDevice(args.deviceName, args.scope, args.githubIdentity)
    deviceId = device.deviceId
    deviceToken = device.token
  } catch (error) {
    console.error('[github-login] Failed to persist pairing credential:', error)
    return { ok: false, reason: 'device_registry_unavailable' }
  }
  const pairingUrl = encodePairingOffer({
    v: PAIRING_OFFER_VERSION,
    endpoint: advertised.endpoint,
    deviceToken,
    publicKeyB64,
    pairedDeviceId: deviceId,
    scope: args.scope
  })
  return { ok: true, pairingUrl, deviceId }
}

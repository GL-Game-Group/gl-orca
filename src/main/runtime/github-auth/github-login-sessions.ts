// In-memory pending device-flow logins. The GitHub device_code never leaves the host; clients
// only hold an opaque loginId, so a leaked id cannot be redeemed against GitHub elsewhere.
import { randomBytes } from 'node:crypto'
import type { DeviceScope } from '../device-registry'

export const GITHUB_LOGIN_MAX_PENDING = 32
// Why: a 3-5 person team never needs more; bounds GitHub API spend from anonymous callers.
export const GITHUB_LOGIN_STARTS_PER_MINUTE = 20

export type PendingGithubLogin = {
  deviceCode: string
  scope: DeviceScope
  deviceName: string
  expiresAt: number
  intervalMs: number
  nextPollAt: number
  /** Set while a poll is in flight so concurrent polls cannot redeem one grant twice. */
  polling: boolean
}

export class GithubLoginSessions {
  private readonly logins = new Map<string, PendingGithubLogin>()
  private startTimestamps: number[] = []

  constructor(private readonly now: () => number = Date.now) {}

  /** Returns null when the pending table or the start rate budget is exhausted. */
  create(args: {
    deviceCode: string
    scope: DeviceScope
    deviceName: string
    expiresInSeconds: number
    intervalSeconds: number
  }): string | null {
    this.sweepExpired()
    if (this.logins.size >= GITHUB_LOGIN_MAX_PENDING) {
      return null
    }
    const now = this.now()
    const loginId = randomBytes(24).toString('base64url')
    this.logins.set(loginId, {
      deviceCode: args.deviceCode,
      scope: args.scope,
      deviceName: args.deviceName,
      expiresAt: now + args.expiresInSeconds * 1000,
      intervalMs: args.intervalSeconds * 1000,
      nextPollAt: now,
      polling: false
    })
    return loginId
  }

  /** Consumes one unit of the start budget; false means the caller must refuse the start. */
  admitStart(): boolean {
    const now = this.now()
    this.startTimestamps = this.startTimestamps.filter((at) => now - at < 60_000)
    if (this.startTimestamps.length >= GITHUB_LOGIN_STARTS_PER_MINUTE) {
      return false
    }
    this.startTimestamps.push(now)
    return true
  }

  /** Claims the next poll slot, honouring GitHub's interval; null when unknown or expired. */
  beginPoll(loginId: string): { login: PendingGithubLogin; ready: boolean } | null {
    const login = this.logins.get(loginId)
    if (!login) {
      return null
    }
    const now = this.now()
    if (now >= login.expiresAt) {
      this.logins.delete(loginId)
      return null
    }
    if (login.polling || now < login.nextPollAt) {
      return { login, ready: false }
    }
    login.polling = true
    login.nextPollAt = now + login.intervalMs
    return { login, ready: true }
  }

  endPoll(loginId: string, slowDownIntervalSeconds?: number): void {
    const login = this.logins.get(loginId)
    if (!login) {
      return
    }
    login.polling = false
    if (slowDownIntervalSeconds !== undefined) {
      login.intervalMs = Math.max(login.intervalMs, slowDownIntervalSeconds * 1000)
      login.nextPollAt = this.now() + login.intervalMs
    }
  }

  delete(loginId: string): void {
    this.logins.delete(loginId)
  }

  get size(): number {
    return this.logins.size
  }

  private sweepExpired(): void {
    const now = this.now()
    for (const [loginId, login] of this.logins) {
      if (now >= login.expiresAt) {
        this.logins.delete(loginId)
      }
    }
  }
}

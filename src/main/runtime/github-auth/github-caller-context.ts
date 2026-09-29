// Carries the GitHub identity behind the current paired-device request through every await,
// so terminal and git spawns deep in the runtime can act as that user without new parameters.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { DeviceGithubIdentity } from '../device-github-identity'

const callerStorage = new AsyncLocalStorage<DeviceGithubIdentity>()

export function runAsGithubCaller<T>(identity: DeviceGithubIdentity | undefined, run: () => T): T {
  return identity ? callerStorage.run(identity, run) : run()
}

export function currentGithubCaller(): DeviceGithubIdentity | undefined {
  return callerStorage.getStore()
}

/** `fn` wrapped so each call runs as `identity`; returns `fn` itself when there is none. */
export function bindGithubCaller<Args extends unknown[], R>(
  identity: DeviceGithubIdentity | undefined,
  fn: (...args: Args) => R
): (...args: Args) => R {
  return identity ? (...args) => callerStorage.run(identity, () => fn(...args)) : fn
}

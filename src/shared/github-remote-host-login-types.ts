// IPC shapes for adding a remote Orca server by GitHub sign-in (desktop main ↔ renderer).
import type { VerifyAndAddRuntimeEnvironmentResult } from './remote-pairing-verification'

export type GithubRemoteHostLoginStartResult =
  | { ok: true; loginKey: string; userCode: string; verificationUri: string }
  | { ok: false; message: string }

export type GithubRemoteHostLoginCompleteResult =
  | VerifyAndAddRuntimeEnvironmentResult
  | { ok: false; kind: 'github-login-failed'; message: string }
  | { ok: false; kind: 'github-login-cancelled'; message: string }

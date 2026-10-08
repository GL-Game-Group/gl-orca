/** GL Work's company account (docs/fork/changes/glwork-account.md), as main reports it to the renderer. */
export type GlWorkAccountStatus = {
  /** False in Orca builds: the renderer then keeps Orca's own account pane. */
  isGlWork: boolean
  /** The company service, e.g. https://agent.glwork.net. */
  server: string
  signedIn: boolean
  member: string | null
  displayName: string | null
  /** Milliseconds since the epoch the device token expires at. */
  expiresAt: number | null
  /** A sign-in is waiting for the browser. */
  signingIn: boolean
  /** Why the last sign-in or check failed, for the member to read. */
  error: string | null
}

/** One company vendor the member may run coding CLIs on (GET /agent-work/models). */
export type GlWorkModelVendor = {
  vendor: string
  name: string
  protocol: 'anthropic' | 'openai'
  /** The company gateway's address for this vendor; the device token is the key there. */
  baseUrl: string
  models: { id: string; name: string }[]
}

export type GlWorkModelsResult =
  | { ok: true; vendors: GlWorkModelVendor[] }
  | { ok: false; error: string }

/** Which CLI a company model can drive: Claude Code speaks Anthropic, Qwen Code OpenAI-compatible. */
export type GlWorkModelSourceTool = 'claude' | 'qwen'

/** A company model chosen for a CLI; null keeps the CLI on the member's own sign-in. */
export type GlWorkModelSource = {
  vendor: string
  vendorName: string
  model: string
  modelName: string
  baseUrl: string
}

export type GlWorkModelSources = Record<GlWorkModelSourceTool, GlWorkModelSource | null>

/** A coding CLI GL Work looks after: members install it and sign in themselves (docs/fork/changes/glwork-cli-tools.md). */
export type GlWorkCliToolId = 'claude' | 'codex' | 'qoder-cn'

export type GlWorkCliToolStatus = {
  id: GlWorkCliToolId
  name: string
  installed: boolean
  /** null: the CLI has no way to tell without reading its credentials, so GL Work does not guess. */
  signedIn: boolean | null
  /** The official install command, run in a terminal the member watches after confirming. */
  installCommand: string
  /** The official sign-in command; the member signs in through the vendor's own flow. */
  signInCommand: string
  /** Orca's agent id, for switching the CLI off in new sessions; null until Orca knows the CLI. */
  agent: 'claude' | 'codex' | 'qoder-cn' | null
}

/** Remote access from the phone through the company's relay (docs/fork/changes/glwork-remote.md). */
export type GlWorkRemoteStatus = {
  /** The member turned it on for this computer. */
  enabled: boolean
  /**
   * off: turned off or not signed in; unavailable: the company will not run it (see message);
   * starting/reconnecting: frpc is on its way; online: the phone can reach this computer.
   */
  state: 'off' | 'unavailable' | 'starting' | 'reconnecting' | 'online'
  message: string | null
}

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

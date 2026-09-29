// Why: the single security boundary for the bundled CLI — auth-token enforcement, metadata publication, transport orchestration.
import { RuntimeRpcShutdown } from './runtime-rpc/runtime-rpc-shutdown'
import type { OrcaRuntimeRpcServerOptions } from './runtime-rpc/runtime-rpc-pairing-types'
import type { HttpRequestInterceptor } from './rpc/ws-transport'

export type {
  PairingOfferUnavailableReason,
  PairingOfferUnavailable
} from './runtime-rpc/runtime-rpc-pairing-types'
export type { MobilePairingConnectionContext } from './runtime-rpc/runtime-rpc-pairing-types'
export type { RuntimeLongPollClass } from './runtime-rpc/runtime-rpc-long-poll'
export { classifyRuntimeLongPoll } from './runtime-rpc/runtime-rpc-long-poll'

export class OrcaRuntimeRpcServer extends RuntimeRpcShutdown {
  constructor(options: OrcaRuntimeRpcServerOptions) {
    super(options)
  }

  setHttpRequestInterceptor(interceptor: HttpRequestInterceptor | null): void {
    this.httpRequestInterceptor = interceptor
  }

  setRequireGithubIdentity(required: boolean): void {
    this.requireGithubIdentity = required
  }
}

export {
  RUNTIME_SOCKET_NAME_REGEX,
  sweepOrphanedRuntimeSockets,
  createRuntimeTransportMetadata
} from './runtime-rpc/runtime-rpc-socket-metadata'

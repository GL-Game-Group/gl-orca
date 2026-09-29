import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'
import { createStaticWebClientHandler } from './static-web-client-handler'

/** Returns true when it owns the request; otherwise the static web client (if any) handles it. */
export type HttpRequestInterceptor = (request: IncomingMessage, response: ServerResponse) => boolean

export function createHttpRequestListener(
  staticRoot: string | undefined,
  interceptor: HttpRequestInterceptor | undefined
): RequestListener | undefined {
  const staticListener = staticRoot ? createStaticWebClientHandler(staticRoot) : undefined
  if (!interceptor) {
    return staticListener
  }
  return (request, response) => {
    if (interceptor(request, response)) {
      return
    }
    if (staticListener) {
      staticListener(request, response)
      return
    }
    response.statusCode = 404
    response.end()
  }
}

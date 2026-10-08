import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GlWorkSignInGate } from './GlWorkSignInGate'

function withGlWork(glwork: { isBuild: boolean; signedInAtLoad: boolean } | undefined): void {
  vi.stubGlobal('window', {
    api: glwork
      ? {
          glwork: {
            ...glwork,
            status: vi.fn(),
            signIn: vi.fn(),
            cancelSignIn: vi.fn(),
            onAccountChanged: vi.fn(() => () => undefined)
          }
        }
      : {}
  })
}

function render(): string {
  return renderToStaticMarkup(
    <GlWorkSignInGate>
      <main>workspace</main>
    </GlWorkSignInGate>
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('GL Work sign-in gate', () => {
  it("renders Orca's app untouched in Orca's builds and in the web client", () => {
    withGlWork({ isBuild: false, signedInAtLoad: false })
    expect(render()).toBe('<main>workspace</main>')
    withGlWork(undefined)
    expect(render()).toBe('<main>workspace</main>')
  })

  it('shows the workspace at once to a member signed in when the window loaded', () => {
    withGlWork({ isBuild: true, signedInAtLoad: true })
    expect(render()).toBe('<main>workspace</main>')
  })

  it('shows only the sign-in screen to a member who is not signed in', () => {
    withGlWork({ isBuild: true, signedInAtLoad: false })
    const html = render()
    expect(html).not.toContain('workspace</main>')
    expect(html).toContain('Sign in to GL Work')
  })
})

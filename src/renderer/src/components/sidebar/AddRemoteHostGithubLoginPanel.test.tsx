import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { parseHostAccessLink } from '../../../../shared/remote-pairing-address'
import { AddRemoteHostGithubLoginPanel } from './AddRemoteHostGithubLoginPanel'
import { AddRemoteHostServerFormPanel } from './AddRemoteHostServerFormPanel'

// Why: the real dialog parts portal out, which renders nothing on the server.
vi.mock('@/components/ui/dialog', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
    DialogDescription: Passthrough,
    DialogFooter: Passthrough
  }
})

function inDialog(node: React.ReactNode): string {
  return renderToStaticMarkup(<>{node}</>)
}

describe('GitHub sign-in in the add-server dialog', () => {
  it('offers GitHub sign-in from the access-link form only when a handler is given', () => {
    const props = {
      name: '',
      pairingCode: '',
      parsedLink: parseHostAccessLink(''),
      allowLoopback: false,
      disabled: false,
      canSubmit: false,
      onNameChange: vi.fn(),
      onPairingCodeChange: vi.fn(),
      onAllowLoopbackChange: vi.fn(),
      onSubmit: vi.fn(),
      onCancel: vi.fn()
    }
    expect(inDialog(<AddRemoteHostServerFormPanel {...props} onUseGithub={vi.fn()} />)).toContain(
      'Sign in with GitHub instead'
    )
    expect(inDialog(<AddRemoteHostServerFormPanel {...props} />)).not.toContain(
      'Sign in with GitHub instead'
    )
  })

  it('starts on the server form with a way back to access links', () => {
    const markup = inDialog(
      <AddRemoteHostGithubLoginPanel onBack={vi.fn()} onCancel={vi.fn()} onSaved={vi.fn()} />
    )
    expect(markup).toContain('id="add-server-github-url"')
    expect(markup).toContain('Continue with GitHub')
    expect(markup).toContain('Use an access link instead')
  })
})

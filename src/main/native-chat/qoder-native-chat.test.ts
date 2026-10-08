import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isNativeChatSupportedAgent,
  resolveNativeChatTranscriptAgent
} from '../../shared/native-chat-agent-support'

const scanned = vi.hoisted((): { dirs: string[] } => ({ dirs: [] }))
vi.mock('../ai-vault/session-scanner-discovery', () => ({
  walkSessionFiles: async (dir: string) => {
    scanned.dirs.push(dir)
    return []
  }
}))

import { resolveSessionFilePath } from './session-file-resolver'
import { readNativeChatTranscript } from './transcript-reader'

// Shaped like a Qoder CN transcript: Claude's records plus Qoder's own bookkeeping lines.
const QODER_TRANSCRIPT = [
  { type: 'runtime-config', model: 'auto', sessionId: 's1' },
  { type: 'workspace-directories', directories: ['/repo'], sessionId: 's1' },
  {
    type: 'user',
    uuid: 'u1',
    parentUuid: null,
    sessionId: 's1',
    timestamp: '2026-10-08T10:00:00.000Z',
    message: { role: 'user', content: [{ type: 'text', text: 'list the files' }] }
  },
  {
    type: 'assistant',
    uuid: 'a1',
    parentUuid: 'u1',
    sessionId: 's1',
    timestamp: '2026-10-08T10:00:01.000Z',
    message: {
      id: 'm1',
      type: 'message',
      role: 'assistant',
      model: 'auto',
      content: [{ type: 'text', text: 'Here they are.' }],
      stop_reason: 'end_turn',
      stop_sequence: null
    }
  },
  { type: 'active-leaf', leafUuid: 'a1', explicit: false, sessionId: 's1' },
  { type: 'last-prompt', lastPrompt: 'list the files', sessionId: 's1' }
]
  .map((record) => JSON.stringify(record))
  .join('\n')

let dir: string

beforeEach(async () => {
  scanned.dirs = []
  dir = await mkdtemp(join(tmpdir(), 'qoder-chat-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('Qoder CN in the chat view', () => {
  it('is a chat agent read with Claude decoders; Qoder is not', () => {
    expect(isNativeChatSupportedAgent('qoder-cn')).toBe(true)
    expect(resolveNativeChatTranscriptAgent('qoder-cn')).toBe('claude')
    expect(isNativeChatSupportedAgent('qoder')).toBe(false)
    expect(resolveNativeChatTranscriptAgent('qoder')).toBeNull()
  })

  it('reads a Qoder transcript into user and assistant messages', async () => {
    const filePath = join(dir, 's1.jsonl')
    await writeFile(filePath, `${QODER_TRANSCRIPT}\n`)

    const result = await readNativeChatTranscript('qoder-cn', 's1', { filePath })

    expect('messages' in result ? result.messages.map((message) => message.role) : result).toEqual([
      'user',
      'assistant'
    ])
  })

  it('falls back to its own projects root, never Claude’s', async () => {
    await resolveSessionFilePath('qoder-cn', 's1')

    expect(scanned.dirs).toEqual([join(homedir(), '.qoder-cn', 'projects')])
  })

  it('prefers the transcript path the hook reported', async () => {
    const filePath = join(dir, 'reported.jsonl')
    await writeFile(filePath, `${QODER_TRANSCRIPT}\n`)

    await expect(
      resolveSessionFilePath('qoder-cn', 's1', { transcriptPath: filePath })
    ).resolves.toBe(filePath)
    expect(scanned.dirs).toEqual([])
  })
})

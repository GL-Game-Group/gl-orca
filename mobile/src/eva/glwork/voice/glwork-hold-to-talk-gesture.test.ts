import { describe, expect, it } from 'vitest'
import {
  draftWithHeard,
  HOLD_TO_TALK_MIN_MS,
  holdToTalkRelease,
  holdToTalkZone
} from './glwork-hold-to-talk-gesture'

describe('hold-to-talk zones', () => {
  it('sends over the button, cancels slid left, edits slid right', () => {
    expect(holdToTalkZone(0, 390)).toBe('send')
    expect(holdToTalkZone(-40, 390)).toBe('send')
    expect(holdToTalkZone(-80, 390)).toBe('cancel')
    expect(holdToTalkZone(80, 390)).toBe('edit')
  })

  it('needs a longer slide on a wider screen', () => {
    expect(holdToTalkZone(-80, 1024)).toBe('send')
    expect(holdToTalkZone(-200, 1024)).toBe('cancel')
  })
})

describe('letting go', () => {
  const held = HOLD_TO_TALK_MIN_MS + 100

  it('sends what was heard, trimmed', () => {
    expect(holdToTalkRelease('send', held, ' 你好 ')).toEqual({ kind: 'send', text: '你好' })
  })

  it('cancels whatever was heard', () => {
    expect(holdToTalkRelease('cancel', held, '你好')).toEqual({ kind: 'cancel' })
  })

  it('treats a tap as too short', () => {
    expect(holdToTalkRelease('send', 100, '你好')).toEqual({ kind: 'too-short' })
  })

  it('sends nothing when nothing was heard, but still opens an empty edit', () => {
    expect(holdToTalkRelease('send', held, '  ')).toEqual({ kind: 'empty' })
    expect(holdToTalkRelease('edit', held, '')).toEqual({ kind: 'edit', text: '' })
  })

  it('adds what was heard after a typed draft', () => {
    expect(draftWithHeard('', '你好')).toBe('你好')
    expect(draftWithHeard('先看日志 ', '再修')).toBe('先看日志 再修')
    expect(draftWithHeard('草稿', '')).toBe('草稿')
  })
})

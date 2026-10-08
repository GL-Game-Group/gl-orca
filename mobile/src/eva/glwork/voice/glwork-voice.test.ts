import { describe, expect, it, vi } from 'vitest'
import { PcmPacker, base64ToBytes, bytesToBase64, utf8Decode, utf8Encode } from './cloud-asr'
import { speechPieces, speechText } from './glwork-speech-text'
import { readVolcServerMessage, volcAudioRequest, volcFullClientRequest } from './volc-asr-frames'

function serverFrame(flags: number, json: unknown): ArrayBuffer {
  const payload = utf8Encode(JSON.stringify(json))
  const out = new Uint8Array(12 + payload.length)
  const view = new DataView(out.buffer)
  out[0] = 0x11
  out[1] = (0b1001 << 4) | flags
  out[2] = 0x10
  view.setInt32(4, 3)
  view.setUint32(8, payload.length)
  out.set(payload, 12)
  return out.buffer
}

describe('Volcengine streaming ASR frames', () => {
  it('frames the request as JSON with a positive sequence', () => {
    const frame = volcFullClientRequest(1, { a: '中' })
    const view = new DataView(frame.buffer)
    expect([...frame.subarray(0, 4)]).toEqual([0x11, 0x11, 0x10, 0x00])
    expect(view.getInt32(4)).toBe(1)
    expect(utf8Decode(frame.subarray(12, 12 + view.getUint32(8)))).toBe('{"a":"中"}')
  })

  it('marks the last audio packet with the last flag and a negative sequence', () => {
    const middle = volcAudioRequest(2, new Uint8Array([1, 2]), false)
    const last = volcAudioRequest(3, new Uint8Array(0), true)
    expect(middle[1]).toBe(0x21)
    expect(new DataView(middle.buffer).getInt32(4)).toBe(2)
    expect(last[1]).toBe(0x23)
    expect(new DataView(last.buffer).getInt32(4)).toBe(-3)
    expect(middle[2]).toBe(0x00)
  })

  it('reads results, the last result and errors', () => {
    expect(readVolcServerMessage(serverFrame(0b0001, { result: { text: '你好' } }))).toEqual({
      kind: 'result',
      text: '你好',
      last: false
    })
    expect(
      readVolcServerMessage(serverFrame(0b0011, { result: { text: '你好。' } }))
    ).toMatchObject({
      last: true
    })
    const message = utf8Encode('auth failed')
    const error = new Uint8Array(12 + message.length)
    const view = new DataView(error.buffer)
    error[0] = 0x11
    error[1] = 0xf0
    view.setUint32(4, 45000001)
    view.setUint32(8, message.length)
    error.set(message, 12)
    expect(readVolcServerMessage(error.buffer)).toEqual({
      kind: 'error',
      code: 45000001,
      message: 'auth failed'
    })
  })
})

describe('voice helpers', () => {
  it('round-trips UTF-8 and base64', () => {
    const text = 'GL Work 语音 👋'
    expect(utf8Decode(utf8Encode(text))).toBe(text)
    expect([...base64ToBytes(bytesToBase64(new Uint8Array([0, 255, 128])))]).toEqual([0, 255, 128])
  })

  it('packs microphone chunks into 100 ms packets', () => {
    const packer = new PcmPacker(4)
    expect(packer.push(new Uint8Array([1, 2]))).toBeNull()
    expect([...(packer.push(new Uint8Array([3, 4, 5])) ?? [])]).toEqual([1, 2, 3, 4, 5])
    expect(packer.drain()).toBeNull()
  })

  it('reads replies without code, marks or overlong tails', () => {
    expect(
      speechText('## 结果\n**完成**了，见 `a.ts`：\n```ts\nconst a = 1\n```\n[链接](https://x)')
    ).toBe('结果 完成了，见 a.ts：（代码略）链接')
    const long = `${'这是一句话。'.repeat(150)}`
    const read = speechText(long)
    expect(read.endsWith('……后面的内容请看屏幕。')).toBe(true)
    expect(read.length).toBeLessThan(620)
    expect(speechPieces('一二三。四五六。七八九。', 5)).toEqual([
      '一二三。',
      '四五六。',
      '七八九。'
    ])
  })
})

describe('Qwen realtime ASR', () => {
  it('sends the session settings and audio, and joins completed items with the live one', async () => {
    const sent: string[] = []
    class FakeSocket {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: unknown }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      send(data: string): void {
        sent.push(data)
      }
      close = vi.fn()
    }
    const socket = new FakeSocket()
    vi.doMock('../company-socket', () => ({ openWebSocketWithHeaders: () => socket }))
    const { startQwenAsr } = await import('./qwen-asr')
    const texts: string[] = []
    const starting = startQwenAsr({
      token: 't',
      model: 'qwen3-asr-flash-realtime',
      onText: (t) => texts.push(t),
      onError: vi.fn()
    })
    socket.onopen?.()
    const session = await starting
    expect(JSON.parse(sent[0] ?? '{}')).toMatchObject({
      type: 'session.update',
      session: { sample_rate: 16000 }
    })
    session.feed(new Uint8Array(3200))
    expect(JSON.parse(sent[1] ?? '{}').type).toBe('input_audio_buffer.append')
    const emit = (event: unknown): void => socket.onmessage?.({ data: JSON.stringify(event) })
    emit({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: '今天天气，'
    })
    emit({ type: 'conversation.item.input_audio_transcription.text', text: '怎么', stash: '样' })
    expect(texts.at(-1)).toBe('今天天气，怎么样')
    const finishing = session.finish()
    expect(JSON.parse(sent.at(-1) ?? '{}').type).toBe('session.finish')
    emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: '怎么样？' })
    emit({ type: 'session.finished' })
    expect(await finishing).toBe('今天天气，怎么样？')
  })
})

describe('handshake failures', () => {
  it('says what a refused handshake means', async () => {
    const { describeAsrHandshakeFailure } = await import('./cloud-asr')
    expect(
      describeAsrHandshakeFailure(
        '火山',
        'volc.seedasr.sauc.duration',
        'Received bad response code from server: 403.'
      )
    ).toContain('没有开通识别资源 volc.seedasr.sauc.duration')
    expect(
      describeAsrHandshakeFailure('火山', 'm', 'Received bad response code from server: 401.')
    ).toContain('Key 无效')
    expect(describeAsrHandshakeFailure('千问', 'm', '')).toBe('连不上千问的语音识别，请检查网络。')
  })
})

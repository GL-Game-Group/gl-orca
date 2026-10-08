import { describe, expect, it } from 'vitest'
import type { CompanyVoiceVendor } from './company-voice'
import { recognitionOptions, speechOptions, vendorShortName } from './glwork-voice-options'
import { readVolcTtsMessage, VOLC_TTS_EVENT, volcTtsEvent } from './volc-tts-frames'
import { utf8Decode, utf8Encode } from './cloud-asr'

const voice = (id: string) => ({ id, name: id, description: null, gender: null, sampleUrl: null })
const qwen: CompanyVoiceVendor = {
  id: 'qwen',
  name: '千问语音',
  protocol: 'dashscope',
  asr: { model: 'qwen3-asr-flash-realtime' },
  asrFile: { model: 'qwen3-asr-flash' },
  ttsStream: { model: 'qwen3-tts-flash-realtime', voices: [voice('Cherry')] },
  tts: { model: 'qwen3-tts-flash', voices: [voice('Cherry'), voice('Ethan')] }
}
const volc: CompanyVoiceVendor = {
  ...qwen,
  id: 'volc',
  name: '火山语音',
  protocol: 'volcengine',
  asrFile: null,
  ttsStream: null
}

describe('voice options', () => {
  it('lists read-aloud as 实时 then 语音 per vendor', () => {
    expect(speechOptions([qwen, volc]).map((o) => [o.label, o.kind, o.model])).toEqual([
      ['千问实时', 'stream', 'qwen3-tts-flash-realtime'],
      ['千问语音', 'file', 'qwen3-tts-flash'],
      ['火山语音', 'file', 'qwen3-tts-flash']
    ])
  })

  it('lists recognition as 实时 then 识别 per vendor', () => {
    expect(recognitionOptions([qwen]).map((o) => [o.label, o.kind, o.model])).toEqual([
      ['千问实时', 'realtime', 'qwen3-asr-flash-realtime'],
      ['千问识别', 'file', 'qwen3-asr-flash']
    ])
  })

  it('shortens the vendor name', () => {
    expect(vendorShortName('千问语音')).toBe('千问')
    expect(vendorShortName('语音')).toBe('语音')
  })
})

/** A server frame as Volcengine sends it: header, event, id, payload. */
function serverFrame(type: number, event: number, id: string, payload: Uint8Array): ArrayBuffer {
  const idBytes = utf8Encode(id)
  const out = new Uint8Array(4 + 4 + 4 + idBytes.length + 4 + payload.length)
  const view = new DataView(out.buffer)
  out.set([0x11, (type << 4) | 0b0100, 0x10, 0x00])
  view.setInt32(4, event)
  view.setUint32(8, idBytes.length)
  out.set(idBytes, 12)
  view.setUint32(12 + idBytes.length, payload.length)
  out.set(payload, 16 + idBytes.length)
  return out.buffer
}

describe('Volcengine TTS frames', () => {
  it('writes a session event with its id and JSON payload', () => {
    const frame = volcTtsEvent(VOLC_TTS_EVENT.FinishSession, 'abc', {})
    const view = new DataView(frame.buffer)
    expect([...frame.subarray(0, 4)]).toEqual([0x11, 0x14, 0x10, 0x00])
    expect(view.getInt32(4)).toBe(102)
    expect(view.getUint32(8)).toBe(3)
    expect(utf8Decode(frame.subarray(12, 15))).toBe('abc')
    expect(utf8Decode(frame.subarray(19))).toBe('{}')
  })

  it('writes a connection event without an id', () => {
    const frame = volcTtsEvent(VOLC_TTS_EVENT.StartConnection, null, {})
    expect(new DataView(frame.buffer).getUint32(8)).toBe(2)
  })

  it('reads audio and session events', () => {
    const pcm = Uint8Array.of(1, 2, 3, 4)
    expect(readVolcTtsMessage(serverFrame(0b1011, 352, 'sid', pcm))).toEqual({ kind: 'audio', pcm })
    expect(readVolcTtsMessage(serverFrame(0b1001, 150, 'sid', utf8Encode('{}')))).toEqual({
      kind: 'event',
      event: 150,
      payload: '{}'
    })
  })
})

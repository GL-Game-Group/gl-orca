/** 16 kHz 16-bit mono PCM pieces as one WAV file's bytes (the phone's microphone and streamed speech). */
export function pcmWavBytes(parts: readonly Uint8Array[], rate = 16_000): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const bytes = new Uint8Array(44 + size)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i += 1) {
      bytes[offset + i] = value.charCodeAt(i)
    }
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + size, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, size, true)
  let offset = 44
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

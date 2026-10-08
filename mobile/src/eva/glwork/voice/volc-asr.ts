import * as ExpoCrypto from 'expo-crypto'
import { openWebSocketWithHeaders } from '../company-socket'
import {
  CLOUD_ASR_FINISH_TIMEOUT_MS,
  PcmPacker,
  whenOpen,
  type CloudAsrOptions,
  type CloudAsrSession
} from './cloud-asr'
import { readVolcServerMessage, volcAudioRequest, volcFullClientRequest } from './volc-asr-frames'

const ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'

/**
 * Volcengine's streaming ASR (Doubao, resource e.g. volc.seedasr.sauc.duration), authenticated with
 * the new console's API key made for GL Work. `result_type: full` returns the whole text so far each
 * time; the response flagged last follows the client's last audio packet.
 */
export async function startVolcAsr(options: CloudAsrOptions): Promise<CloudAsrSession> {
  const socket = openWebSocketWithHeaders(ENDPOINT, {
    'X-Api-Key': options.token,
    'X-Api-Resource-Id': options.model,
    'X-Api-Connect-Id': ExpoCrypto.randomUUID()
  })
  socket.binaryType = 'arraybuffer'
  await whenOpen(socket, '火山', options.model)
  let text = ''
  let finished: (() => void) | null = null
  let closed = false

  socket.onmessage = (message) => {
    if (!(message.data instanceof ArrayBuffer)) {
      return
    }
    const read = readVolcServerMessage(message.data)
    if (read.kind === 'error') {
      options.onError(new Error(`火山语音识别出错：${read.code} ${read.message}`.trim()))
      finished?.()
      return
    }
    if (read.kind === 'result') {
      if (read.text) {
        text = read.text
        options.onText(text)
      }
      if (read.last) {
        finished?.()
      }
    }
  }
  socket.onerror = () => {
    if (!closed) {
      options.onError(new Error('火山语音识别的连接断开了。'))
    }
  }
  socket.onclose = () => {
    closed = true
    finished?.()
  }

  let sequence = 1
  socket.send(
    volcFullClientRequest(sequence, {
      user: { uid: 'glwork-phone' },
      audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
      request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true, result_type: 'full' }
    })
  )

  const packer = new PcmPacker(3200)
  const send = (packet: Uint8Array | null, last: boolean): void => {
    if (closed || (!packet && !last)) {
      return
    }
    sequence += 1
    socket.send(volcAudioRequest(sequence, packet ?? new Uint8Array(0), last))
  }

  return {
    feed: (pcm) => send(packer.push(pcm), false),
    finish: () =>
      new Promise((resolve) => {
        const timer = setTimeout(() => finished?.(), CLOUD_ASR_FINISH_TIMEOUT_MS)
        finished = () => {
          finished = null
          clearTimeout(timer)
          closed = true
          socket.close()
          resolve(text.trim())
        }
        if (closed) {
          finished()
          return
        }
        send(packer.drain(), true)
      }),
    cancel: () => {
      closed = true
      socket.close()
    }
  }
}

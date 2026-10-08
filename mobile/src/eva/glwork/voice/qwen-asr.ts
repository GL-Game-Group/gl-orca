import { openWebSocketWithHeaders } from '../company-socket'
import {
  CLOUD_ASR_FINISH_TIMEOUT_MS,
  PcmPacker,
  bytesToBase64,
  whenOpen,
  type CloudAsrOptions,
  type CloudAsrSession
} from './cloud-asr'

const ENDPOINT = 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime'

/**
 * Qwen-ASR-Realtime (DashScope, e.g. qwen3-asr-flash-realtime) in VAD mode: the server cuts the speech
 * into items; each item's `text` is confirmed and `stash` still being recognized, and `completed`
 * gives its final transcript. `session.finish` makes it finish the last item before `session.finished`.
 */
export async function startQwenAsr(options: CloudAsrOptions): Promise<CloudAsrSession> {
  const socket = openWebSocketWithHeaders(
    `${ENDPOINT}?model=${encodeURIComponent(options.model)}`,
    {
      Authorization: `Bearer ${options.token}`
    }
  )
  await whenOpen(socket, '千问')
  const done: string[] = []
  let live = ''
  let finished: (() => void) | null = null
  let closed = false
  const transcript = (): string => (done.join('') + live).trim()

  socket.onmessage = (message) => {
    if (typeof message.data !== 'string') {
      return
    }
    let event: Record<string, unknown>
    try {
      event = JSON.parse(message.data)
    } catch {
      return
    }
    switch (event.type) {
      case 'conversation.item.input_audio_transcription.text':
        live = `${String(event.text ?? '')}${String(event.stash ?? '')}`
        options.onText(transcript())
        break
      case 'conversation.item.input_audio_transcription.completed':
        done.push(String(event.transcript ?? ''))
        live = ''
        options.onText(transcript())
        break
      case 'session.finished':
        finished?.()
        break
      case 'error': {
        const error: Record<string, unknown> =
          typeof event.error === 'object' && event.error !== null ? { ...event.error } : {}
        options.onError(
          new Error(`千问语音识别出错：${String(error.message ?? error.code ?? '未知错误')}`)
        )
        break
      }
      default:
    }
  }
  socket.onerror = () => {
    if (!closed) {
      options.onError(new Error('千问语音识别的连接断开了。'))
    }
  }
  socket.onclose = () => {
    closed = true
    finished?.()
  }

  socket.send(
    JSON.stringify({
      type: 'session.update',
      session: {
        input_audio_format: 'pcm',
        sample_rate: 16000,
        input_audio_transcription: { language: 'zh' },
        turn_detection: { type: 'server_vad', threshold: 0, silence_duration_ms: 400 }
      }
    })
  )

  const packer = new PcmPacker(3200)
  const append = (packet: Uint8Array | null): void => {
    if (packet && !closed) {
      socket.send(
        JSON.stringify({ type: 'input_audio_buffer.append', audio: bytesToBase64(packet) })
      )
    }
  }

  return {
    feed: (pcm) => append(packer.push(pcm)),
    finish: () =>
      new Promise((resolve) => {
        append(packer.drain())
        const timer = setTimeout(() => finished?.(), CLOUD_ASR_FINISH_TIMEOUT_MS)
        finished = () => {
          finished = null
          clearTimeout(timer)
          closed = true
          socket.close()
          resolve(transcript())
        }
        if (closed) {
          finished()
          return
        }
        socket.send(JSON.stringify({ type: 'session.finish' }))
      }),
    cancel: () => {
      closed = true
      socket.close()
    }
  }
}

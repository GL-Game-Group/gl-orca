import { openWebSocketWithHeaders } from '../company-socket'
import { base64ToBytes, whenOpen } from './cloud-asr'
import {
  SPEECH_STREAM_RATE,
  SPEECH_STREAM_TIMEOUT_MS,
  type SpeechStreamRequest
} from './glwork-speech-stream'

const ENDPOINT = 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime'

function eventId(): string {
  return `glwork-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Qwen-TTS-Realtime (e.g. qwen3-tts-flash-realtime): the whole text in server-commit mode, then
 * `session.finish`; audio arrives as `response.audio.delta` until `session.finished`.
 */
export async function streamQwenSpeech(request: SpeechStreamRequest): Promise<void> {
  const socket = openWebSocketWithHeaders(
    `${ENDPOINT}?model=${encodeURIComponent(request.model)}`,
    { Authorization: `Bearer ${request.token}` }
  )
  await whenOpen(socket, '千问', request.model, '合成')
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const settle = (error?: Error): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      socket.close()
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    const timer = setTimeout(
      () => settle(new Error('千问实时播报超时了。')),
      SPEECH_STREAM_TIMEOUT_MS
    )
    socket.onmessage = (message) => {
      if (!request.isCurrent()) {
        settle()
        return
      }
      if (typeof message.data !== 'string') {
        return
      }
      let event: Record<string, unknown>
      try {
        event = JSON.parse(message.data)
      } catch {
        return
      }
      if (event.type === 'response.audio.delta' && typeof event.delta === 'string') {
        request.onAudio(base64ToBytes(event.delta))
      } else if (event.type === 'session.finished') {
        settle()
      } else if (event.type === 'error') {
        const error: Record<string, unknown> =
          typeof event.error === 'object' && event.error !== null ? { ...event.error } : {}
        settle(new Error(`千问实时播报出错：${String(error.message ?? error.code ?? '未知错误')}`))
      }
    }
    socket.onerror = () => settle(new Error('千问实时播报的连接断开了。'))
    socket.onclose = () => settle()
    const send = (body: Record<string, unknown>): void =>
      socket.send(JSON.stringify({ event_id: eventId(), ...body }))
    send({
      type: 'session.update',
      session: {
        mode: 'server_commit',
        voice: request.voice,
        language_type: 'Chinese',
        response_format: 'pcm',
        sample_rate: SPEECH_STREAM_RATE
      }
    })
    send({ type: 'input_text_buffer.append', text: request.text })
    send({ type: 'session.finish' })
  })
}

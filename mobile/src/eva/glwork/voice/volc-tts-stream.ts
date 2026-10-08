import * as ExpoCrypto from 'expo-crypto'
import { openWebSocketWithHeaders } from '../company-socket'
import { whenOpen } from './cloud-asr'
import {
  SPEECH_STREAM_RATE,
  SPEECH_STREAM_TIMEOUT_MS,
  type SpeechStreamRequest
} from './glwork-speech-stream'
import { readVolcTtsMessage, VOLC_TTS_EVENT, volcTtsEvent } from './volc-tts-frames'

const ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/tts/bidirection'

/**
 * Volcengine's bidirectional TTS with the GL Work API key: StartConnection → StartSession → the text
 * as one TaskRequest → FinishSession; PCM comes as TTSResponse frames until SessionFinished.
 */
export async function streamVolcSpeech(request: SpeechStreamRequest): Promise<void> {
  const socket = openWebSocketWithHeaders(ENDPOINT, {
    'X-Api-Key': request.token,
    'X-Api-Resource-Id': request.model,
    'X-Api-Connect-Id': ExpoCrypto.randomUUID()
  })
  socket.binaryType = 'arraybuffer'
  await whenOpen(socket, '火山', request.model, '合成')
  const sessionId = ExpoCrypto.randomUUID()
  const params = {
    speaker: request.voice,
    audio_params: { format: 'pcm', sample_rate: SPEECH_STREAM_RATE, speech_rate: request.rate }
  }
  const body = (event: number, reqParams: Record<string, unknown>) => ({
    user: { uid: 'glwork-phone' },
    event,
    namespace: 'BidirectionalTTS',
    req_params: reqParams
  })
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
      () => settle(new Error('火山实时播报超时了。')),
      SPEECH_STREAM_TIMEOUT_MS
    )
    socket.onmessage = (message) => {
      if (!request.isCurrent()) {
        settle()
        return
      }
      if (!(message.data instanceof ArrayBuffer)) {
        return
      }
      const frame = readVolcTtsMessage(message.data)
      if (frame.kind === 'audio') {
        request.onAudio(frame.pcm)
      } else if (frame.kind === 'error') {
        settle(new Error(`火山实时播报出错（${frame.code}）：${frame.message}`))
      } else if (frame.kind === 'event') {
        switch (frame.event) {
          case VOLC_TTS_EVENT.ConnectionStarted:
            socket.send(
              volcTtsEvent(
                VOLC_TTS_EVENT.StartSession,
                sessionId,
                body(VOLC_TTS_EVENT.StartSession, params)
              )
            )
            break
          case VOLC_TTS_EVENT.SessionStarted:
            socket.send(
              volcTtsEvent(
                VOLC_TTS_EVENT.TaskRequest,
                sessionId,
                body(VOLC_TTS_EVENT.TaskRequest, { ...params, text: request.text })
              )
            )
            socket.send(volcTtsEvent(VOLC_TTS_EVENT.FinishSession, sessionId, {}))
            break
          case VOLC_TTS_EVENT.SessionFinished:
            socket.send(volcTtsEvent(VOLC_TTS_EVENT.FinishConnection, null, {}))
            settle()
            break
          case VOLC_TTS_EVENT.ConnectionFailed:
          case VOLC_TTS_EVENT.SessionFailed:
            settle(new Error(`火山实时播报失败：${frame.payload.slice(0, 200)}`))
            break
          default:
        }
      }
    }
    socket.onerror = () => settle(new Error('火山实时播报的连接断开了。'))
    socket.onclose = () => settle()
    socket.send(volcTtsEvent(VOLC_TTS_EVENT.StartConnection, null, {}))
  })
}

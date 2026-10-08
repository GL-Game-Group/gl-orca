import * as ExpoCrypto from 'expo-crypto'
import type { CloudAsrOptions, CloudAsrSession } from './cloud-asr'
import { startFileAsr } from './file-asr'

const ENDPOINT = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash'
const OK = '20000000'

/** Volcengine's 录音文件识别极速版 (e.g. volc.bigasr.auc_turbo): the whole recording in one request. */
export function startVolcFileAsr(options: CloudAsrOptions): CloudAsrSession {
  return startFileAsr(options, async (wav, signal) => {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': options.token,
        'x-api-resource-id': options.model,
        'x-api-request-id': ExpoCrypto.randomUUID(),
        'x-api-sequence': '-1'
      },
      body: JSON.stringify({
        user: { uid: 'glwork-phone' },
        audio: { data: wav, format: 'wav' },
        request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true }
      }),
      signal
    })
    const status = response.headers.get('x-api-status-code')
    const body: unknown = await response.json().catch(() => null)
    const result =
      typeof body === 'object' && body !== null && 'result' in body ? body.result : null
    const text =
      typeof result === 'object' && result !== null && 'text' in result ? result.text : null
    if (!response.ok || (status !== null && status !== OK) || typeof text !== 'string') {
      const message = response.headers.get('x-api-message') ?? ''
      throw new Error(`火山识别失败（${status ?? response.status}${message ? ` ${message}` : ''}）`)
    }
    return text
  })
}

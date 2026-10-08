import type { CloudAsrOptions, CloudAsrSession } from './cloud-asr'
import { startFileAsr } from './file-asr'

const ENDPOINT =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  return Object.entries(value).find(([name]) => name === key)?.[1]
}

/** Qwen-ASR (e.g. qwen3-asr-flash) over HTTP: the recording as a data URL in one user message. */
export function startQwenFileAsr(options: CloudAsrOptions): CloudAsrSession {
  return startFileAsr(options, async (wav, signal) => {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        input: {
          messages: [{ role: 'user', content: [{ audio: `data:audio/wav;base64,${wav}` }] }]
        },
        parameters: { asr_options: { enable_itn: true } }
      }),
      signal
    })
    const body: unknown = await response.json().catch(() => null)
    const choices = field(field(body, 'output'), 'choices')
    const choice: unknown = Array.isArray(choices) ? choices[0] : undefined
    const content = field(field(choice, 'message'), 'content')
    const text = Array.isArray(content) ? field(content[0], 'text') : undefined
    if (!response.ok || typeof text !== 'string') {
      const message = field(body, 'message')
      throw new Error(
        `千问识别失败（${response.status}${typeof message === 'string' ? ` ${message}` : ''}）`
      )
    }
    return text
  })
}

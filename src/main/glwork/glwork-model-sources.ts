import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  GlWorkModelSource,
  GlWorkModelSourceTool,
  GlWorkModelSources
} from '../../shared/glwork-account-types'
import { readGlWorkAccount } from './glwork-account-store'
import { isGlWorkBuild } from './glwork-build'

const FILE_NAME = 'glwork-model-sources.json'
const NONE: GlWorkModelSources = { claude: null, qwen: null }

function sourcesPath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

function readSource(value: unknown): GlWorkModelSource | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const fields: Record<string, unknown> = { ...value }
  const { vendor, vendorName, model, modelName, baseUrl } = fields
  return typeof vendor === 'string' &&
    typeof vendorName === 'string' &&
    typeof model === 'string' &&
    typeof modelName === 'string' &&
    typeof baseUrl === 'string'
    ? { vendor, vendorName, model, modelName, baseUrl }
    : null
}

export function readGlWorkModelSources(): GlWorkModelSources {
  if (!existsSync(sourcesPath())) {
    return { ...NONE }
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(sourcesPath(), 'utf8'))
    const fields: Record<string, unknown> =
      typeof parsed === 'object' && parsed !== null ? { ...parsed } : {}
    return { claude: readSource(fields.claude), qwen: readSource(fields.qwen) }
  } catch {
    return { ...NONE }
  }
}

/** Choose a company model for one CLI, or null for the member's own sign-in. */
export function writeGlWorkModelSource(
  tool: GlWorkModelSourceTool,
  source: GlWorkModelSource | null
): GlWorkModelSources {
  const next = { ...readGlWorkModelSources(), [tool]: source ? readSource(source) : null }
  writeFileSync(sourcesPath(), `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  return next
}

const COMMAND_EDGE = `(^|[\\s;&|('"\`])(?:[^\\s;&|('"\`]*[\\\\/])?`
const CLAUDE_COMMAND = new RegExp(`${COMMAND_EDGE}claude(?:\\.cmd|\\.exe)?($|[\\s;&|)'"\`])`, 'i')
const QWEN_COMMAND = new RegExp(`${COMMAND_EDGE}qwen(?:\\.cmd|\\.exe)?($|[\\s;&|)'"\`])`, 'i')

/** The CLI a terminal command starts, when it is one a company model can drive. */
export function companyModelToolFor(command: string | undefined): GlWorkModelSourceTool | null {
  if (!command) {
    return null
  }
  if (CLAUDE_COMMAND.test(command)) {
    return 'claude'
  }
  return QWEN_COMMAND.test(command) ? 'qwen' : null
}

/**
 * The environment that points a CLI at the chosen company model through the company gateway,
 * the member's device token as its key. Pure, for tests; see glworkCompanyModelEnv.
 */
export function companyModelEnv(
  tool: GlWorkModelSourceTool,
  source: GlWorkModelSource,
  token: string
): Record<string, string> {
  if (tool === 'claude') {
    return {
      ANTHROPIC_BASE_URL: source.baseUrl,
      ANTHROPIC_AUTH_TOKEN: token,
      ANTHROPIC_MODEL: source.model,
      // Why: Claude Code's background and subagent calls name Anthropic models the gateway refuses.
      ANTHROPIC_DEFAULT_OPUS_MODEL: source.model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: source.model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: source.model,
      ANTHROPIC_SMALL_FAST_MODEL: source.model,
      CLAUDE_CODE_SUBAGENT_MODEL: source.model,
      // Why: on a company model nothing should reach Anthropic (telemetry, error reports, update checks).
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
    }
  }
  return { OPENAI_BASE_URL: source.baseUrl, OPENAI_API_KEY: token, OPENAI_MODEL: source.model }
}

/**
 * eva: put a terminal launch on the chosen company model: merge the variables into its env and
 * report it, so the caller skips Claude account handling for this launch (a managed Claude
 * account would otherwise strip ANTHROPIC_AUTH_TOKEN).
 */
export function applyGlWorkCompanyModel(args: {
  command?: string
  connectionId?: string | null
  env?: Record<string, string>
}): boolean {
  const added = glworkCompanyModelEnv(args.command, args.connectionId)
  if (Object.keys(added).length === 0) {
    return false
  }
  args.env = { ...args.env, ...added }
  return true
}

/**
 * eva: what a local terminal launching Claude Code or Qwen Code gets added when the member
 * chose a company model for it; empty otherwise (Orca builds, remote hosts, no sign-in).
 */
export function glworkCompanyModelEnv(
  command: string | undefined,
  connectionId: string | null | undefined
): Record<string, string> {
  const tool = companyModelToolFor(command)
  if (!tool || connectionId || !isGlWorkBuild()) {
    return {}
  }
  const source = readGlWorkModelSources()[tool]
  const account = source ? readGlWorkAccount() : null
  return source && account ? companyModelEnv(tool, source, account.token) : {}
}

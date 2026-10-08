import { app } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runProcess, spawnProcess } from '../../shared/child-process/run-process'
import {
  GLWORK_FRPC_TOKEN_ENV,
  initialGlWorkFrpcState,
  readGlWorkFrpcLogLine,
  type GlWorkFrpcState
} from './glwork-frpc-config'

const RESTART_MIN_MS = 5_000
const RESTART_MAX_MS = 60_000

/** The frpc packaged with GL Work (config/glwork-builder.config.cjs), or the fetched one in dev. */
export function glworkFrpcPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'glwork', 'frpc', 'frpc')
    : join(app.getAppPath(), 'resources', 'glwork', 'frpc', `darwin-${process.arch}`, 'frpc')
}

function pidFile(): string {
  return join(app.getPath('userData'), 'glwork-frpc.pid')
}

/** An frpc this app left running when it last quit abruptly would hold the tunnel; stop it. */
async function stopLeftoverFrpc(binary: string): Promise<void> {
  if (!existsSync(pidFile())) {
    return
  }
  const pid = Number(readFileSync(pidFile(), 'utf8').trim())
  rmSync(pidFile(), { force: true })
  if (!Number.isInteger(pid) || pid <= 1) {
    return
  }
  // Why: the pid may have been reused; only stop it while it still runs our frpc.
  const result = await runProcess({ program: 'ps', args: ['-p', String(pid), '-o', 'command='] })
  if (result.code === 0 && result.stdout.trim().startsWith(binary)) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Already gone.
    }
  }
}

/** One frpc, restarted with backoff until stopped; its log folds into a state for the settings page. */
export class GlWorkFrpcProcess {
  private child: ReturnType<typeof spawnProcess> | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private delay = RESTART_MIN_MS
  private running: { config: string; token: string } | null = null
  state: GlWorkFrpcState = initialGlWorkFrpcState()

  private readonly onChange: () => void

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  get runningConfig(): string | null {
    return this.running?.config ?? null
  }

  async start(config: string, token: string): Promise<void> {
    if (this.running?.config === config && this.running.token === token) {
      return
    }
    this.stop()
    const binary = glworkFrpcPath()
    if (!existsSync(binary)) {
      this.state = { connection: 'refused', message: `frpc is missing: ${binary}`, proxyOk: false }
      this.onChange()
      return
    }
    await stopLeftoverFrpc(binary)
    this.running = { config, token }
    this.delay = RESTART_MIN_MS
    this.spawn(binary)
  }

  stop(): void {
    this.running = null
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    const child = this.child
    this.child = null
    child?.kill('SIGTERM')
    rmSync(pidFile(), { force: true })
    this.state = initialGlWorkFrpcState()
  }

  private spawn(binary: string): void {
    const running = this.running
    if (!running) {
      return
    }
    const configPath = join(app.getPath('userData'), 'glwork-frpc.toml')
    // Why 0600: it holds the header secret that lets the company's relay pair phones.
    writeFileSync(configPath, running.config, { mode: 0o600 })
    const child = spawnProcess({
      program: binary,
      args: ['-c', configPath],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        [GLWORK_FRPC_TOKEN_ENV]: running.token
      },
      timeoutMs: null
    })
    this.child = child
    this.state = initialGlWorkFrpcState()
    if (child.pid) {
      writeFileSync(pidFile(), String(child.pid), { mode: 0o600 })
    }
    let pending = ''
    const read = (chunk: Buffer): void => {
      pending += chunk.toString('utf8')
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) {
        this.state = readGlWorkFrpcLogLine(this.state, line)
        if (this.state.proxyOk) {
          this.delay = RESTART_MIN_MS
        }
      }
      this.onChange()
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.on('error', (error) => {
      this.state = { connection: 'refused', message: error.message, proxyOk: false }
      this.onChange()
    })
    child.on('exit', () => {
      if (this.child !== child) {
        return
      }
      this.child = null
      this.state = { ...this.state, connection: 'reconnecting', proxyOk: false }
      this.onChange()
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null
        this.spawn(binary)
      }, this.delay)
      this.delay = Math.min(this.delay * 2, RESTART_MAX_MS)
    })
  }
}

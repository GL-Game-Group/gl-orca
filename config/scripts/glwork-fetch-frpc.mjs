/**
 * Put the pinned frpc GL Work ships for remote access from the phone
 * (docs/fork/changes/glwork-remote.md) at resources/glwork/frpc/darwin-<arch>/frpc,
 * where config/glwork-builder.config.cjs packages it from and dev builds run it.
 *
 * The release archive must match the sha256 pinned in resources/glwork/frpc-release.json,
 * or nothing is written. Only frpc is taken from the archive.
 *
 *   node config/scripts/glwork-fetch-frpc.mjs [arm64|x64 ...]   # default: this Mac's arch
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const frpcRoot = join(root, 'resources/glwork/frpc')
const release = JSON.parse(readFileSync(join(root, 'resources/glwork/frpc-release.json'), 'utf8'))
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

async function fetchFrpc(arch) {
  const entry = release.targets[`darwin-${arch}`]
  if (!entry) {
    throw new Error(`no frpc pinned for darwin-${arch}`)
  }
  const dest = join(frpcRoot, `darwin-${arch}`)
  const marker = join(dest, 'VERSION')
  const stamp = `frp ${release.version} ${entry.asset} sha256:${entry.sha256}\n`
  if (
    existsSync(join(dest, 'frpc')) &&
    existsSync(marker) &&
    readFileSync(marker, 'utf8') === stamp
  ) {
    return
  }
  const cache = join(frpcRoot, '.cache')
  mkdirSync(cache, { recursive: true })
  const archive = join(cache, entry.asset)
  if (!existsSync(archive) || sha256(archive) !== entry.sha256) {
    const url = release.url.replace('{version}', release.version).replace('{asset}', entry.asset)
    console.log(`[glwork:frpc] downloading ${url}`)
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(300_000) })
    if (!response.ok) {
      throw new Error(`download failed (${response.status}): ${url}`)
    }
    writeFileSync(`${archive}.part`, Buffer.from(await response.arrayBuffer()))
    const actual = sha256(`${archive}.part`)
    if (actual !== entry.sha256) {
      rmSync(`${archive}.part`)
      throw new Error(`${entry.asset}: sha256 ${actual} does not match the pinned ${entry.sha256}`)
    }
    copyFileSync(`${archive}.part`, archive)
    rmSync(`${archive}.part`)
  }
  const top = entry.asset.replace(/\.tar\.gz$/u, '')
  const scratch = mkdtempSync(join(tmpdir(), 'glwork-frpc-'))
  try {
    execFileSync('tar', ['-xf', archive, '-C', scratch, `${top}/frpc`], { stdio: 'inherit' })
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    copyFileSync(join(scratch, top, 'frpc'), join(dest, 'frpc'))
    chmodSync(join(dest, 'frpc'), 0o755)
    writeFileSync(marker, stamp)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
  console.log(`[glwork:frpc] frpc ${release.version} for darwin-${arch}`)
}

const archs = process.argv.slice(2)
for (const arch of archs.length > 0 ? archs : [process.arch]) {
  await fetchFrpc(arch)
}

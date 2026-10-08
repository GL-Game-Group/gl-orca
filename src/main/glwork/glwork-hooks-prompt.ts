import { app, ipcMain } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isGlWorkBuild } from './glwork-build'

/**
 * GL Work asks once, after the first sign-in, whether to turn the agent status hooks on (they edit
 * the coding tools' own settings, so they wait for the member's yes). Answered either way, it does not
 * ask again; Settings → Coding tools → Agent status changes it any time.
 */
function markerPath(): string {
  return join(app.getPath('userData'), 'glwork-hooks-asked')
}

export function registerGlWorkHooksPromptIpcHandlers(): void {
  ipcMain.handle('glwork:hooksPromptDue', () => isGlWorkBuild() && !existsSync(markerPath()))
  ipcMain.handle('glwork:hooksPromptAnswered', () => {
    writeFileSync(markerPath(), `${new Date().toISOString()}\n`)
  })
}

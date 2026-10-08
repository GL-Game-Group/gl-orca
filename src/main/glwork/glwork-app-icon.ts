import glworkIcon from '../../../resources/glwork/icon.png?asset'
import { isGlWorkBuild } from './glwork-build'

/**
 * GL Work's icon wherever Orca would set its own (Dock, windows, tray), or null in Orca's builds.
 * Orca's app icon setting (classic, watercolor, blue) does not apply to GL Work.
 */
export function glworkAppIconPath(): string | null {
  return isGlWorkBuild() ? glworkIcon : null
}

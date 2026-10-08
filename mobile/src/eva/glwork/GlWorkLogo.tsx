import { SvgXml } from 'react-native-svg'
import { GLWORK_LOGO_SVG } from './glwork-logo-mark'

const ASPECT = 321 / 363

/** GL Work's mark, drawn where Orca's would be (OrcaLogo in GL Work builds). */
export function GlWorkLogo({ size = 24 }: { size?: number }) {
  return <SvgXml xml={GLWORK_LOGO_SVG} width={size * ASPECT} height={size} />
}

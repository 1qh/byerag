import { ImageResponse } from 'next/og'

const size = { height: 32, width: 32 }
const contentType = 'image/png'
const STYLE = {
  alignItems: 'center',
  background: '#1f2937',
  borderRadius: 6,
  color: '#ffffff',
  display: 'flex',
  fontFamily: 'serif',
  fontSize: 22,
  fontWeight: 600,
  height: '100%',
  justifyContent: 'center',
  width: '100%'
} as const
const Icon = (): ImageResponse => new ImageResponse(<div style={STYLE}>u</div>, size)
export { contentType, size }
export default Icon

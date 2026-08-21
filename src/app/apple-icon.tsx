import { ImageResponse } from 'next/og'

export const size = {
  width: 180,
  height: 180,
}

export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#7c3aed',
          borderRadius: 40,
        }}
      >
        <div style={{ position: 'relative', width: 112, height: 112, display: 'flex' }}>
          <div style={{ position: 'absolute', left: 26, top: 49, width: 64, height: 9, background: '#ffffff', transform: 'rotate(-18deg)', borderRadius: 999 }} />
          <div style={{ position: 'absolute', left: 28, top: 65, width: 70, height: 9, background: '#ffffff', transform: 'rotate(38deg)', borderRadius: 999 }} />
          <div style={{ position: 'absolute', left: 8, top: 42, width: 27, height: 27, background: '#ffffff', borderRadius: 999 }} />
          <div style={{ position: 'absolute', right: 6, top: 18, width: 27, height: 27, background: '#ffffff', borderRadius: 999 }} />
          <div style={{ position: 'absolute', right: 2, bottom: 12, width: 27, height: 27, background: '#ffffff', borderRadius: 999 }} />
        </div>
      </div>
    ),
    size,
  )
}

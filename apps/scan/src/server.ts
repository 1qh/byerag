const MAX_BYTES = Number(process.env.MAX_FILE_BYTES ?? 104_857_600)
const CLAMD_HOST = process.env.CLAMD_HOST ?? 'clamav'
const CLAMD_PORT = Number(process.env.CLAMD_PORT ?? 3310)
const PORT = Number(process.env.PORT ?? 8080)
const sha256 = async (buf: Uint8Array): Promise<string> => {
  const h = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}
const detectMime = (buf: Uint8Array): string => {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf'
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'application/zip'
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'text/plain'
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  return 'application/octet-stream'
}
const scanInstream = async (buf: Uint8Array): Promise<{ found: false } | { found: true; signature: string }> => {
  const out: string[] = []
  const conn = await Bun.connect({
    hostname: CLAMD_HOST,
    port: CLAMD_PORT,
    socket: {
      data(_s, data) {
        out.push(new TextDecoder().decode(data))
      },
      error() {},
      open() {}
    }
  })
  conn.write('zINSTREAM\0')
  const sizeBuf = new ArrayBuffer(4)
  new DataView(sizeBuf).setUint32(0, buf.length, false)
  conn.write(new Uint8Array(sizeBuf))
  conn.write(buf)
  conn.write(new Uint8Array(new ArrayBuffer(4)))
  await new Promise(r => setTimeout(r, 500))
  conn.end()
  const reply = out.join('')
  if (reply.includes('FOUND')) {
    const sig = reply.split('stream: ')[1]?.split(' FOUND')[0] ?? 'unknown'
    return { found: true, signature: sig }
  }
  return { found: false }
}
const handleScan = async (req: Request): Promise<Response> => {
  const buf = new Uint8Array(await req.arrayBuffer())
  if (buf.length === 0) return Response.json({ error: { code: 'EMPTY', message: 'empty body' } }, { status: 400 })
  if (buf.length > MAX_BYTES)
    return Response.json({ error: { code: 'TOO_LARGE', message: `body > ${MAX_BYTES}` } }, { status: 413 })
  const [hash, scan] = await Promise.all([sha256(buf), scanInstream(buf)])
  if (scan.found) return Response.json({ error: { code: 'INFECTED', message: scan.signature }, ok: false })
  return Response.json({ mime: detectMime(buf), ok: true, sha256: hash, size: buf.length })
}
Bun.serve({
  fetch: async req => {
    const url = new URL(req.url)
    if (req.method === 'GET' && url.pathname === '/healthz') return new Response('ok')
    if (req.method === 'POST' && url.pathname === '/scan') return handleScan(req)
    return new Response('not found', { status: 404 })
  },
  port: PORT
})

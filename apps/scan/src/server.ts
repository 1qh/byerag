import { Hono } from 'hono'
const MAX_BYTES = Number(process.env.MAX_FILE_BYTES ?? 104_857_600)
const CLAMD_HOST = process.env.CLAMD_HOST ?? 'clamav'
const CLAMD_PORT = Number(process.env.CLAMD_PORT ?? 3310)
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
  const conn = await Bun.connect({
    hostname: CLAMD_HOST,
    port: CLAMD_PORT,
    socket: { data() {}, error() {}, open() {} }
  })
  conn.write('zINSTREAM\0')
  const sizeBuf = new ArrayBuffer(4)
  new DataView(sizeBuf).setUint32(0, buf.length, false)
  conn.write(new Uint8Array(sizeBuf))
  conn.write(buf)
  const zero = new ArrayBuffer(4)
  conn.write(new Uint8Array(zero))
  const out: string[] = []
  conn.data = (_s, data) => out.push(new TextDecoder().decode(data))
  await new Promise(r => setTimeout(r, 500))
  conn.end()
  const reply = out.join('')
  if (reply.includes('FOUND')) {
    const sig = reply.split('stream: ')[1]?.split(' FOUND')[0] ?? 'unknown'
    return { found: true, signature: sig }
  }
  return { found: false }
}
const app = new Hono()
app.get('/healthz', c => c.text('ok'))
app.post('/scan', async c => {
  const buf = new Uint8Array(await c.req.arrayBuffer())
  if (buf.length === 0) return c.json({ error: { code: 'EMPTY', message: 'empty body' } }, 400)
  if (buf.length > MAX_BYTES) return c.json({ error: { code: 'TOO_LARGE', message: `body > ${MAX_BYTES}` } }, 413)
  const [hash, scan] = await Promise.all([sha256(buf), scanInstream(buf)])
  if (scan.found) return c.json({ error: { code: 'INFECTED', message: scan.signature }, ok: false }, 200)
  return c.json({ mime: detectMime(buf), ok: true, sha256: hash, size: buf.length })
})
const port = Number(process.env.PORT ?? 8080)
Bun.serve({ fetch: app.fetch, port })

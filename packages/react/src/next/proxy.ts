/** biome-ignore-all lint/style/noProcessEnv: proxy NODE_ENV + CONVEX_URL gate */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: NEXT_PUBLIC_CONVEX_URL */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
const isDev = process.env.NODE_ENV !== 'production'
const HTTPS_PREFIX = /^https/u
const HTTP_PREFIX = /^http/u
const convexOrigin = ((): string => {
  try {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? ''
    if (!url) return ''
    const parsed = new URL(url)
    return `${parsed.origin} ${parsed.origin.replace(HTTPS_PREFIX, 'wss').replace(HTTP_PREFIX, 'ws')}`
  } catch {
    return ''
  }
})()
const buildCsp = (): string =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net${isDev ? " 'unsafe-eval'" : ''}`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    `img-src 'self' data: blob: https://lh3.googleusercontent.com ${convexOrigin} https://*.convex.cloud https://*.convex.site`,
    `frame-src 'self' blob: ${convexOrigin} https://*.convex.cloud https://*.convex.site`,
    `object-src 'self' ${convexOrigin} https://*.convex.cloud https://*.convex.site`,
    "font-src 'self' data: https://cdn.jsdelivr.net",
    `connect-src 'self' https://cdn.jsdelivr.net https://*.convex.cloud https://*.convex.site wss://*.convex.cloud wss://*.convex.site ${convexOrigin} https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com"
  ].join('; ')
export const proxy = (req: NextRequest): NextResponse => {
  const res = NextResponse.next({ request: req })
  res.headers.set('Content-Security-Policy', buildCsp())
  return res
}
export const config = {
  matcher: [
    {
      missing: [
        { key: 'next-router-prefetch', type: 'header' },
        { key: 'purpose', type: 'header', value: 'prefetch' }
      ],
      source: '/((?!_next/static|_next/image|favicon.ico).*)'
    }
  ]
}

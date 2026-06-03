/** biome-ignore-all lint/style/noProcessEnv: Next config reads env at build time, no app boundary involved */
import type { NextConfig } from 'next'

const HTTPS_PREFIX = /^https/u
const HTTP_PREFIX = /^http/u
const isDev = process.env.NODE_ENV !== 'production'
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
const csp = [
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
const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }
]
/* eslint-disable-next-line @typescript-eslint/require-await */
const getHeaders = async () => [{ headers: securityHeaders, source: '/((?!_next/static|_next/image|favicon.ico).*)' }]
const defaultNextConfig: NextConfig = {
  headers: getHeaders,
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['backend', '@a/cli', '@a/react', 'idecn']
}
export { defaultNextConfig }

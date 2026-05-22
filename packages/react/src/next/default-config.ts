import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }
]
/* eslint-disable-next-line @typescript-eslint/require-await */
const getHeaders = async () => [{ headers: securityHeaders, source: '/:path*' }]
const defaultNextConfig: NextConfig = {
  headers: getHeaders,
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['backend', '@a/cli', '@a/react', 'idecn']
}
export { defaultNextConfig }

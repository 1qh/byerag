export { proxy } from '@a/react/next/proxy'
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

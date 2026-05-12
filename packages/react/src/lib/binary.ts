const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCodePoint(...bytes.slice(i, i + 8192))
  return btoa(binary)
}
const base64ToBytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), c => c.codePointAt(0) ?? 0)
const downloadBlob = (filename: string, blob: Blob): void => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
export { arrayBufferToBase64, base64ToBytes, downloadBlob }

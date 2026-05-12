const hashSecret = async (secret: string): Promise<string> => {
  const bytes = new TextEncoder().encode(secret)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
const generateSecret = (): string => crypto.randomUUID()
export { generateSecret, hashSecret }

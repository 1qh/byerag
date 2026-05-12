interface RegistryEntry {
  meta: { description?: string; tier?: 'admin' | 'user' }
  tier: 'admin' | 'user'
}
const REGISTRY: Record<string, RegistryEntry> = {}
export { REGISTRY }
export type { RegistryEntry }

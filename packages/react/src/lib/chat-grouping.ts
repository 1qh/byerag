type BucketLabel = 'Older' | 'Previous 7 days' | 'Today' | 'Yesterday'
const DAY_MS = 24 * 60 * 60 * 1000
const bucket = (ts: number, now: number): BucketLabel => {
  const delta = now - ts
  if (delta < DAY_MS) return 'Today'
  if (delta < 2 * DAY_MS) return 'Yesterday'
  if (delta < 7 * DAY_MS) return 'Previous 7 days'
  return 'Older'
}
const BUCKET_ORDER: readonly BucketLabel[] = ['Today', 'Yesterday', 'Previous 7 days', 'Older']
const groupByTime = <T extends { updatedAt: number }>(
  chats: readonly T[],
  now: number
): { chats: T[]; label: BucketLabel }[] => {
  const groups = new Map<BucketLabel, T[]>()
  for (const c of chats) {
    const label = bucket(c.updatedAt, now)
    const existing = groups.get(label)
    if (existing) existing.push(c)
    else groups.set(label, [c])
  }
  return BUCKET_ORDER.filter(l => groups.has(l)).map(label => ({ chats: groups.get(label) ?? [], label }))
}
export { groupByTime }
export type { BucketLabel }

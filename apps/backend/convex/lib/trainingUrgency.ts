const DAY_MS = 86_400_000
const DEFAULT_DUE_DAYS = 14
const DUE_SOON_DAYS = 3
type Urgency = 'due-soon' | 'open' | 'overdue' | 'passed-assigned' | 'passed-self'
interface UrgencyInput {
  assignedPassed: boolean
  assignmentRows: { createdAt: number; dueAtMs?: number }[]
  dueMs: number
  now: number
  selfPassed: boolean
}
interface UrgencyResult {
  dueInDays?: number
  effectiveDueAtMs?: number
  overdueDays?: number
  urgency: Urgency
}
const deriveUrgency = (i: UrgencyInput): UrgencyResult => {
  if (i.assignedPassed) return { urgency: 'passed-assigned' }
  if (i.assignmentRows.length === 0) return i.selfPassed ? { urgency: 'passed-self' } : { urgency: 'open' }
  const effectiveDueAtMs = Math.min(...i.assignmentRows.map(r => r.dueAtMs ?? r.createdAt + i.dueMs))
  if (i.now > effectiveDueAtMs)
    return {
      effectiveDueAtMs,
      overdueDays: Math.max(1, Math.ceil((i.now - effectiveDueAtMs) / DAY_MS)),
      urgency: 'overdue'
    }
  const dueInDays = Math.max(0, Math.ceil((effectiveDueAtMs - i.now) / DAY_MS))
  return { dueInDays, effectiveDueAtMs, urgency: dueInDays <= DUE_SOON_DAYS ? 'due-soon' : 'open' }
}
export { DAY_MS, DEFAULT_DUE_DAYS, deriveUrgency, DUE_SOON_DAYS }
export type { Urgency, UrgencyInput, UrgencyResult }

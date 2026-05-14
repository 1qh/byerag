import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'
const crons = cronJobs()
crons.daily('audit retention purge', { hourUTC: 4, minuteUTC: 0 }, internal.lib.pruneAuditLogs, {})
crons.daily('owner-spend stale pruning', { hourUTC: 4, minuteUTC: 5 }, internal.ownerSpend.pruneStaleSpend, {})
crons.hourly('rate-limit stale pruning', { minuteUTC: 0 }, internal.lib.pruneStaleRateLimits, {})
crons.daily('xTraces expiry purge', { hourUTC: 4, minuteUTC: 10 }, internal.tools._app.dispatch.pruneExpiredTraces, {})
crons.daily('agent auto-assign training cells', { hourUTC: 3, minuteUTC: 0 }, internal.training.autoAssign, {})
crons.daily('hard-purge soft-deleted docs after 30d', { hourUTC: 4, minuteUTC: 30 }, internal.docs.purgeSoftDeleted, {})
export default crons

import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'
const crons = cronJobs()
crons.daily('audit retention purge', { hourUTC: 4, minuteUTC: 0 }, internal.lib.pruneAuditLogs, {})
crons.daily('owner-spend stale pruning', { hourUTC: 4, minuteUTC: 5 }, internal.ownerSpend.pruneStaleSpend, {})
crons.hourly('rate-limit stale pruning', { minuteUTC: 0 }, internal.lib.pruneStaleRateLimits, {})
crons.daily('xTraces expiry purge', { hourUTC: 4, minuteUTC: 10 }, internal.tools._app.dispatch.pruneExpiredTraces, {})
crons.interval('agent auto-assign scheduler', { minutes: 5 }, internal.training.autoAssign, {})
crons.daily('hard-purge soft-deleted docs after 30d', { hourUTC: 4, minuteUTC: 30 }, internal.docs.purgeSoftDeleted, {})
crons.hourly('quarantine staging blob 1h TTL', { minuteUTC: 15 }, internal.docs.purgeQuarantineStaging, {})
export default crons

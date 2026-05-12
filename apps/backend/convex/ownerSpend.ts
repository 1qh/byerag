/** biome-ignore-all lint/performance/noAwaitInLoops: sequential dup-row consolidation */
/** biome-ignore-all lint/style/noProcessEnv: Convex env is process.env at runtime */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: ALLOWED_EMAILS is platform env */
/* eslint-disable no-await-in-loop */
/* oxlint-disable eslint(no-await-in-loop) */
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internal } from './_generated/api'
import { internalMutation, internalQuery } from './_generated/server'
import { log } from './utils'
const DAILY_USD_CAP = 25
const DAILY_CENTS_CAP = DAILY_USD_CAP * 100
const isAdmin = (owner: string): boolean => {
  const raw = process.env.ALLOWED_EMAILS ?? ''
  const lower = owner.toLowerCase()
  for (const e of raw.split(',')) if (e.trim().toLowerCase() === lower) return true
  return false
}
const CAP_OVERSHOOT_TOLERANCE = DAILY_CENTS_CAP * 1.1
const MAX_INFLIGHT_PER_OWNER = 8
const ESTIMATE_CENTS_PER_CALL = 100
const dayKey = (now: number): string => new Date(now).toISOString().slice(0, 10)
const getRows = async (ctx: MutationCtx | QueryCtx, owner: string) =>
  ctx.db
    .query('ownerSpend')
    .withIndex('by_owner', q => q.eq('owner', owner))
    .take(10)
const findRowForDay = async (
  ctx: MutationCtx,
  owner: string,
  day: string
): Promise<{ centsToday: number; id: Id<'ownerSpend'> | null; inflight: number }> => {
  const rows = await getRows(ctx, owner)
  const row = rows.find(r => r.dayKey === day)
  return row
    ? { centsToday: row.centsToday, id: row._id, inflight: row.inflight ?? 0 }
    : { centsToday: 0, id: null, inflight: 0 }
}
const consolidate = async (
  ctx: MutationCtx,
  owner: string,
  today: string
): Promise<{ centsToday: number; id: Id<'ownerSpend'> | null; inflight: number }> => {
  const rows = await getRows(ctx, owner)
  if (rows.length === 0) return { centsToday: 0, id: null, inflight: 0 }
  const todayRow = rows.find(r => r.dayKey === today)
  const stale = rows.filter(r => r._id !== todayRow?._id && r.dayKey < today && (r.inflight ?? 0) === 0)
  for (const d of stale) await ctx.db.delete(d._id)
  if (!todayRow) return { centsToday: 0, id: null, inflight: 0 }
  return { centsToday: todayRow.centsToday, id: todayRow._id, inflight: todayRow.inflight ?? 0 }
}
interface InvariantCheck {
  centsToday: number
  inflight: number
  owner: string
  where: string
}
const checkInvariants = ({ where, owner, centsToday, inflight }: InvariantCheck): void => {
  if (centsToday > CAP_OVERSHOOT_TOLERANCE)
    log('error', 'spend.cap.overshoot', { centsToday, dailyCentsCap: DAILY_CENTS_CAP, owner, where })
  if (inflight > MAX_INFLIGHT_PER_OWNER)
    log('error', 'spend.inflight.overshoot', { inflight, max: MAX_INFLIGHT_PER_OWNER, owner, where })
  if (inflight < 0) log('error', 'spend.inflight.negative', { inflight, owner, where })
  if (centsToday < 0) log('error', 'spend.cents.negative', { centsToday, owner, where })
}
const reserveBudget = internalMutation({
  args: { cents: v.optional(v.number()), owner: v.string() },
  handler: async (
    ctx,
    { owner, cents }
  ): Promise<{ centsToday: number; dayKey: string; ok: boolean; reason?: string }> => {
    const reserve = cents ?? ESTIMATE_CENTS_PER_CALL
    const today = dayKey(Date.now())
    const before = await consolidate(ctx, owner, today)
    const admin = isAdmin(owner)
    if (!admin && before.inflight >= MAX_INFLIGHT_PER_OWNER) {
      log('warn', 'spend.reserve.rejected', {
        beforeCents: before.centsToday,
        beforeInflight: before.inflight,
        owner,
        reason: 'inflight',
        reserve
      })
      return { centsToday: before.centsToday, dayKey: today, ok: false, reason: 'inflight' }
    }
    if (!admin && before.centsToday + reserve > DAILY_CENTS_CAP) {
      log('warn', 'spend.reserve.rejected', {
        beforeCents: before.centsToday,
        beforeInflight: before.inflight,
        owner,
        reason: 'cap',
        reserve
      })
      return { centsToday: before.centsToday, dayKey: today, ok: false, reason: 'cap' }
    }
    const next = before.centsToday + reserve
    const nextInflight = before.inflight + 1
    await (before.id
      ? ctx.db.patch(before.id, { centsToday: next, inflight: nextInflight })
      : ctx.db.insert('ownerSpend', { centsToday: next, dayKey: today, inflight: 1, owner }))
    checkInvariants({ centsToday: next, inflight: nextInflight, owner, where: 'reserveBudget' })
    log('info', 'spend.reserve', {
      afterCents: next,
      afterInflight: nextInflight,
      beforeCents: before.centsToday,
      beforeInflight: before.inflight,
      dayKey: today,
      owner,
      reserve
    })
    return { centsToday: next, dayKey: today, ok: true }
  },
  returns: v.object({
    centsToday: v.number(),
    dayKey: v.string(),
    ok: v.boolean(),
    reason: v.optional(v.string())
  })
})
const checkBudget = internalQuery({
  args: { owner: v.string() },
  handler: async (ctx, { owner }): Promise<{ centsToday: number; ok: boolean }> => {
    const today = dayKey(Date.now())
    const rows = await getRows(ctx, owner)
    const centsToday = rows.find(r => r.dayKey === today)?.centsToday ?? 0
    return { centsToday, ok: centsToday < DAILY_CENTS_CAP }
  },
  returns: v.object({ centsToday: v.number(), ok: v.boolean() })
})
const addSpend = internalMutation({
  args: { cents: v.number(), owner: v.string() },
  handler: async (ctx, { owner, cents }) => {
    const today = dayKey(Date.now())
    const before = await consolidate(ctx, owner, today)
    const next = Math.max(0, before.centsToday + cents)
    if (before.id) await ctx.db.patch(before.id, { centsToday: next })
    else if (next > 0) await ctx.db.insert('ownerSpend', { centsToday: next, dayKey: today, owner })
    checkInvariants({ centsToday: next, inflight: before.inflight, owner, where: 'addSpend' })
    log('info', 'spend.adjust', {
      afterCents: next,
      beforeCents: before.centsToday,
      cents,
      dayKey: today,
      owner,
      where: 'addSpend'
    })
  }
})
const PRUNE_SPEND_BATCH = 500
const pruneStaleSpend = internalMutation({
  args: {},
  handler: async ctx => {
    const today = dayKey(Date.now())
    const candidates = await ctx.db
      .query('ownerSpend')
      .withIndex('by_dayKey', q => q.lt('dayKey', today))
      .take(PRUNE_SPEND_BATCH)
    const deletable = candidates.filter(r => (r.inflight ?? 0) === 0)
    const skipped = candidates.length - deletable.length
    await Promise.all(deletable.map(async r => ctx.db.delete(r._id)))
    log('info', 'spend.prune', { candidates: candidates.length, deleted: deletable.length, skipped })
    if (deletable.length === PRUNE_SPEND_BATCH) await ctx.scheduler.runAfter(5000, internal.ownerSpend.pruneStaleSpend, {})
  }
})
const addSpendScheduled = internalMutation({
  args: { cents: v.number(), dayKey: v.optional(v.string()), owner: v.string() },
  handler: async (ctx, { owner, cents, dayKey: targetDay }) => {
    const day = targetDay ?? dayKey(Date.now())
    const before = await findRowForDay(ctx, owner, day)
    const next = Math.max(0, before.centsToday + cents)
    await (before.id
      ? ctx.db.patch(before.id, { centsToday: next })
      : next > 0
        ? ctx.db.insert('ownerSpend', { centsToday: next, dayKey: day, owner })
        : Promise.resolve())
    checkInvariants({ centsToday: next, inflight: before.inflight, owner, where: 'addSpendScheduled' })
    log('info', 'spend.adjust', {
      afterCents: next,
      beforeCents: before.centsToday,
      cents,
      dayKey: day,
      owner,
      where: 'addSpendScheduled'
    })
  }
})
const settleReservation = internalMutation({
  args: {
    actualCents: v.number(),
    owner: v.string(),
    reservedCents: v.number(),
    reservedDayKey: v.string()
  },
  handler: async (ctx, { owner, reservedCents, reservedDayKey: rDay, actualCents }) => {
    const reserved = await findRowForDay(ctx, owner, rDay)
    const today = dayKey(Date.now())
    if (!reserved.id) {
      if (actualCents > 0) {
        const todayRow = await findRowForDay(ctx, owner, today)
        const next = todayRow.centsToday + actualCents
        await (todayRow.id
          ? ctx.db.patch(todayRow.id, { centsToday: next })
          : ctx.db.insert('ownerSpend', { centsToday: actualCents, dayKey: today, owner }))
        checkInvariants({ centsToday: next, inflight: todayRow.inflight, owner, where: 'settleReservation/orphan' })
      }
      log('warn', 'spend.settle.reserved-pruned', { actualCents, owner, rDay, reservedCents, today })
      return
    }
    const inflight = Math.max(0, reserved.inflight - 1)
    if (rDay === today) {
      const delta = actualCents - reservedCents
      const next = Math.max(0, reserved.centsToday + delta)
      await ctx.db.patch(reserved.id, { centsToday: next, inflight })
      checkInvariants({ centsToday: next, inflight, owner, where: 'settleReservation/same-day' })
      log('info', 'spend.settle', {
        actualCents,
        afterCents: next,
        afterInflight: inflight,
        beforeCents: reserved.centsToday,
        beforeInflight: reserved.inflight,
        dayKey: today,
        delta,
        kind: 'same-day',
        owner,
        rDay,
        reservedCents
      })
      return
    }
    const refundOldDay = Math.min(actualCents, reservedCents) - reservedCents
    const oldNext = Math.max(0, reserved.centsToday + refundOldDay)
    await ctx.db.patch(reserved.id, { centsToday: oldNext, inflight })
    checkInvariants({ centsToday: oldNext, inflight, owner, where: 'settleReservation/cross-midnight-old' })
    const overage = Math.max(0, actualCents - reservedCents)
    let todayAfter = 0
    let todayBefore = 0
    if (overage > 0) {
      const todayRow = await findRowForDay(ctx, owner, today)
      todayBefore = todayRow.centsToday
      todayAfter = todayBefore + overage
      await (todayRow.id
        ? ctx.db.patch(todayRow.id, { centsToday: todayAfter })
        : ctx.db.insert('ownerSpend', { centsToday: overage, dayKey: today, owner }))
      checkInvariants({
        centsToday: todayAfter,
        inflight: todayRow.inflight,
        owner,
        where: 'settleReservation/cross-midnight-today'
      })
    }
    log('info', 'spend.settle', {
      actualCents,
      afterCents: oldNext,
      afterInflight: inflight,
      beforeCents: reserved.centsToday,
      beforeInflight: reserved.inflight,
      dayKey: today,
      kind: 'cross-midnight',
      overage,
      owner,
      rDay,
      refundOldDay,
      reservedCents,
      todayAfter,
      todayBefore
    })
  }
})
const SCAN_BATCH = 1000
const auditInvariants = internalMutation({
  args: {},
  handler: async ctx => {
    const today = dayKey(Date.now())
    const rows = await ctx.db.query('ownerSpend').take(SCAN_BATCH)
    let overshootCents = 0
    let overshootInflight = 0
    let stuckInflight = 0
    const yesterday = dayKey(Date.now() - 24 * 60 * 60 * 1000)
    for (const r of rows) {
      if (r.centsToday > CAP_OVERSHOOT_TOLERANCE) {
        overshootCents += 1
        log('error', 'audit.cap.overshoot', { centsToday: r.centsToday, dayKey: r.dayKey, owner: r.owner })
      }
      if ((r.inflight ?? 0) > MAX_INFLIGHT_PER_OWNER) {
        overshootInflight += 1
        log('error', 'audit.inflight.overshoot', { dayKey: r.dayKey, inflight: r.inflight, owner: r.owner })
      }
      if (r.dayKey < yesterday && (r.inflight ?? 0) > 0) {
        stuckInflight += 1
        log('warn', 'audit.inflight.stuck.refunding', {
          centsToday: r.centsToday,
          dayKey: r.dayKey,
          inflight: r.inflight,
          owner: r.owner
        })
        await ctx.db.patch(r._id, { centsToday: 0, inflight: 0 })
      }
    }
    log('info', 'audit.summary', {
      overshootCents,
      overshootInflight,
      rows: rows.length,
      stuckInflight,
      today
    })
  }
})
export {
  addSpend,
  addSpendScheduled,
  auditInvariants,
  checkBudget,
  DAILY_CENTS_CAP,
  DAILY_USD_CAP,
  ESTIMATE_CENTS_PER_CALL,
  MAX_INFLIGHT_PER_OWNER,
  pruneStaleSpend,
  reserveBudget,
  settleReservation
}

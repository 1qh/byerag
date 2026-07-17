import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { makeTest } from '../test-utils/convex'
import { internal } from './_generated/api'

const DAILY_CENTS_CAP = 2500
const MAX_INFLIGHT_PER_OWNER = 8
const dayKeyOf = (ts: number): string => new Date(ts).toISOString().slice(0, 10)
const realDateNow = Date.now.bind(Date)
const setNow = (ms: number): void => {
  Date.now = (): number => ms
}
const restoreNow = (): void => {
  Date.now = realDateNow
}
const totalCents = async (
  t: ReturnType<typeof makeTest>,
  owner: string
): Promise<{ centsToday: number; inflight: number; rows: { centsToday: number; dayKey: string; inflight: number }[] }> =>
  t.run(async ctx => {
    const rows = await ctx.db
      .query('ownerSpend')
      .withIndex('by_owner', q => q.eq('owner', owner))
      .collect()
    const today = dayKeyOf(Date.now())
    const todayRow = rows.find(r => r.dayKey === today)
    return {
      centsToday: todayRow?.centsToday ?? 0,
      inflight: rows.reduce((acc, r) => acc + (r.inflight ?? 0), 0),
      rows: rows.map(r => ({ centsToday: r.centsToday, dayKey: r.dayKey, inflight: r.inflight ?? 0 }))
    }
  })
describe('ownerSpend synthetic load', () => {
  afterEach(() => {
    restoreNow()
  })
  test('inflight cap blocks 9th concurrent reserve', async () => {
    const t = makeTest()
    const owner = 'cap-inflight@x'
    const results = await Promise.all(
      Array.from({ length: 12 }, async () => t.mutation(internal.ownerSpend.reserveBudget, { cents: 100, owner }))
    )
    const accepted = results.filter(r => r.ok).length
    const rejectedInflight = results.filter(r => !r.ok && r.reason === 'inflight').length
    expect(accepted).toBe(MAX_INFLIGHT_PER_OWNER)
    expect(rejectedInflight).toBe(12 - MAX_INFLIGHT_PER_OWNER)
    const after = await totalCents(t, owner)
    expect(after.inflight).toBe(MAX_INFLIGHT_PER_OWNER)
    expect(after.centsToday).toBe(MAX_INFLIGHT_PER_OWNER * 100)
  })
  test('daily cap blocks reserves once exceeded', async () => {
    const t = makeTest()
    const owner = 'cap-cents@x'
    let acceptedCount = 0
    let rejectedCap = 0
    for (let i = 0; i < 30; i += 1) {
      const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 200, owner })
      if (r.ok) {
        acceptedCount += 1
        await t.mutation(internal.ownerSpend.settleReservation, {
          actualCents: 200,
          owner,
          reservedCents: 200,
          reservedDayKey: r.dayKey
        })
      } else if (r.reason === 'cap') rejectedCap += 1
    }
    expect(acceptedCount * 200).toBeLessThanOrEqual(DAILY_CENTS_CAP)
    expect(rejectedCap).toBeGreaterThan(0)
    const after = await totalCents(t, owner)
    expect(after.centsToday).toBeLessThanOrEqual(DAILY_CENTS_CAP)
    expect(after.inflight).toBe(0)
  })
  test('books balance under reserve+settle cycle', async () => {
    const t = makeTest()
    const owner = 'books@x'
    const cycles = 20
    const reserve = 80
    const actuals = [10, 50, 80, 30, 0, 100, 25, 75, 5, 60, 40, 70, 90, 20, 15, 35, 55, 45, 65, 85]
    const expectedTotal = actuals.reduce((s, a) => s + a, 0)
    for (let i = 0; i < cycles; i += 1) {
      const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: reserve, owner })
      expect(r.ok).toBe(true)
      await t.mutation(internal.ownerSpend.settleReservation, {
        actualCents: actuals[i] ?? 0,
        owner,
        reservedCents: reserve,
        reservedDayKey: r.dayKey
      })
    }
    const after = await totalCents(t, owner)
    expect(after.centsToday).toBe(expectedTotal)
    expect(after.inflight).toBe(0)
  })
  test('reserve+refund returns to zero', async () => {
    const t = makeTest()
    const owner = 'refund@x'
    for (let i = 0; i < 5; i += 1) {
      const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 150, owner })
      await t.mutation(internal.ownerSpend.settleReservation, {
        actualCents: 0,
        owner,
        reservedCents: 150,
        reservedDayKey: r.dayKey
      })
    }
    const after = await totalCents(t, owner)
    expect(after.centsToday).toBe(0)
    expect(after.inflight).toBe(0)
  })
  test('overage routes to today; old day refunded; no double-spend', async () => {
    const t = makeTest()
    const owner = 'midnight@x'
    const beforeMidnight = Date.UTC(2026, 3, 24, 23, 59, 0)
    const afterMidnight = Date.UTC(2026, 3, 25, 0, 1, 0)
    setNow(beforeMidnight)
    const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 500, owner })
    expect(r.ok).toBe(true)
    expect(r.dayKey).toBe('2026-04-24')
    setNow(afterMidnight)
    await t.mutation(internal.ownerSpend.settleReservation, {
      actualCents: 700,
      owner,
      reservedCents: 500,
      reservedDayKey: r.dayKey
    })
    const after = await totalCents(t, owner)
    const yesterday = after.rows.find(row => row.dayKey === '2026-04-24')
    const today = after.rows.find(row => row.dayKey === '2026-04-25')
    expect(yesterday?.centsToday).toBe(500)
    expect(yesterday?.inflight).toBe(0)
    expect(today?.centsToday).toBe(200)
  })
  test('cross-midnight under-spend keeps old-day at actual', async () => {
    const t = makeTest()
    const owner = 'midnight-under@x'
    setNow(Date.UTC(2026, 3, 24, 23, 59, 0))
    const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 500, owner })
    setNow(Date.UTC(2026, 3, 25, 0, 1, 0))
    await t.mutation(internal.ownerSpend.settleReservation, {
      actualCents: 200,
      owner,
      reservedCents: 500,
      reservedDayKey: r.dayKey
    })
    const after = await totalCents(t, owner)
    const yesterday = after.rows.find(row => row.dayKey === '2026-04-24')
    const today = after.rows.find(row => row.dayKey === '2026-04-25')
    expect(yesterday?.centsToday).toBe(200)
    expect(yesterday?.inflight).toBe(0)
    expect(today).toBeUndefined()
  })
  test('cross-midnight refund (actual=0) zeroes old-day spend', async () => {
    const t = makeTest()
    const owner = 'midnight-refund@x'
    setNow(Date.UTC(2026, 3, 24, 23, 59, 0))
    const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 300, owner })
    setNow(Date.UTC(2026, 3, 25, 0, 1, 0))
    await t.mutation(internal.ownerSpend.settleReservation, {
      actualCents: 0,
      owner,
      reservedCents: 300,
      reservedDayKey: r.dayKey
    })
    const after = await totalCents(t, owner)
    const yesterday = after.rows.find(row => row.dayKey === '2026-04-24')
    expect(yesterday?.centsToday).toBe(0)
    expect(yesterday?.inflight).toBe(0)
  })
  test('pruneStaleSpend skips inflight>0 rows', async () => {
    const t = makeTest()
    const owner = 'prune@x'
    setNow(Date.UTC(2026, 3, 24, 12, 0, 0))
    const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 200, owner })
    expect(r.dayKey).toBe('2026-04-24')
    setNow(Date.UTC(2026, 3, 26, 12, 0, 0))
    await t.mutation(internal.ownerSpend.pruneStaleSpend, {})
    const after = await totalCents(t, owner)
    const old = after.rows.find(row => row.dayKey === '2026-04-24')
    expect(old).toBeDefined()
    expect(old?.inflight).toBe(1)
  })
  test('pruneStaleSpend removes settled rows', async () => {
    const t = makeTest()
    const owner = 'prune-clean@x'
    setNow(Date.UTC(2026, 3, 24, 12, 0, 0))
    const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 200, owner })
    await t.mutation(internal.ownerSpend.settleReservation, {
      actualCents: 100,
      owner,
      reservedCents: 200,
      reservedDayKey: r.dayKey
    })
    setNow(Date.UTC(2026, 3, 26, 12, 0, 0))
    await t.mutation(internal.ownerSpend.pruneStaleSpend, {})
    const after = await totalCents(t, owner)
    expect(after.rows).toHaveLength(0)
  })
  test('settleReservation with pruned reserved row still posts actual to today', async () => {
    const t = makeTest()
    const owner = 'pruned-reserved@x'
    setNow(Date.UTC(2026, 3, 24, 12, 0, 0))
    const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 200, owner })
    await t.run(async ctx => {
      const rows = await ctx.db
        .query('ownerSpend')
        .withIndex('by_owner', q => q.eq('owner', owner))
        .collect()
      for (const row of rows) await ctx.db.delete(row._id)
    })
    setNow(Date.UTC(2026, 3, 25, 12, 0, 0))
    await t.mutation(internal.ownerSpend.settleReservation, {
      actualCents: 50,
      owner,
      reservedCents: 200,
      reservedDayKey: r.dayKey
    })
    const after = await totalCents(t, owner)
    const today = after.rows.find(row => row.dayKey === '2026-04-25')
    expect(today?.centsToday).toBe(50)
  })
  test('addSpendScheduled negative delta clamps at zero', async () => {
    const t = makeTest()
    const owner = 'clamp@x'
    await t.mutation(internal.ownerSpend.addSpendScheduled, { cents: 100, owner })
    await t.mutation(internal.ownerSpend.addSpendScheduled, { cents: -500, owner })
    const after = await totalCents(t, owner)
    expect(after.centsToday).toBe(0)
  })
  test('checkBudget mirrors centsToday', async () => {
    const t = makeTest()
    const owner = 'check@x'
    const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 1500, owner })
    await t.mutation(internal.ownerSpend.settleReservation, {
      actualCents: 1500,
      owner,
      reservedCents: 1500,
      reservedDayKey: r.dayKey
    })
    const c = await t.query(internal.ownerSpend.checkBudget, { owner })
    expect(c.centsToday).toBe(1500)
    expect(c.ok).toBe(true)
  })
  test('checkBudget reports cap exhausted', async () => {
    const t = makeTest()
    const owner = 'check-cap@x'
    const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 2500, owner })
    await t.mutation(internal.ownerSpend.settleReservation, {
      actualCents: 2500,
      owner,
      reservedCents: 2500,
      reservedDayKey: r.dayKey
    })
    const c = await t.query(internal.ownerSpend.checkBudget, { owner })
    expect(c.centsToday).toBe(2500)
    expect(c.ok).toBe(false)
  })
  test('auditInvariants no-ops on empty', async () => {
    const t = makeTest()
    await t.mutation(internal.ownerSpend.auditInvariants, {})
  })
  test('auditInvariants tolerates healthy rows', async () => {
    const t = makeTest()
    const owner = 'healthy@x'
    const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 100, owner })
    await t.mutation(internal.ownerSpend.settleReservation, {
      actualCents: 75,
      owner,
      reservedCents: 100,
      reservedDayKey: r.dayKey
    })
    await t.mutation(internal.ownerSpend.auditInvariants, {})
  })
  test('inflight scoped per owner', async () => {
    const t = makeTest()
    const a = 'iso-a@x'
    const b = 'iso-b@x'
    const reservesA = await Promise.all(
      Array.from({ length: 8 }, async () => t.mutation(internal.ownerSpend.reserveBudget, { cents: 100, owner: a }))
    )
    const reservesB = await Promise.all(
      Array.from({ length: 8 }, async () => t.mutation(internal.ownerSpend.reserveBudget, { cents: 100, owner: b }))
    )
    expect(reservesA.every(r => r.ok)).toBe(true)
    expect(reservesB.every(r => r.ok)).toBe(true)
    const aAfter = await totalCents(t, a)
    const bAfter = await totalCents(t, b)
    expect(aAfter.inflight).toBe(8)
    expect(bAfter.inflight).toBe(8)
  })
  test('settle decrements inflight even when rDay differs', async () => {
    const t = makeTest()
    const owner = 'inflight-cross@x'
    setNow(Date.UTC(2026, 3, 24, 23, 59, 0))
    const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 100, owner })
    setNow(Date.UTC(2026, 3, 25, 0, 1, 0))
    await t.mutation(internal.ownerSpend.settleReservation, {
      actualCents: 50,
      owner,
      reservedCents: 100,
      reservedDayKey: r.dayKey
    })
    const after = await totalCents(t, owner)
    expect(after.inflight).toBe(0)
  })
  test('mixed cycle: 50 reserves, 50 settles, books balance + cap honored', async () => {
    const t = makeTest()
    const owner = 'mixed@x'
    const reserves: { dayKey: string; ok: boolean; reserveCents: number }[] = []
    let totalActual = 0
    for (let i = 0; i < 50; i += 1) {
      const reserveCents = 80
      const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: reserveCents, owner })
      if (r.ok) reserves.push({ dayKey: r.dayKey, ok: true, reserveCents })
      else reserves.push({ dayKey: r.dayKey, ok: false, reserveCents })
      if (i % 2 === 1) {
        const last = reserves[i - 1]
        if (last?.ok) {
          const actual = (i * 7) % 100
          totalActual += actual
          await t.mutation(internal.ownerSpend.settleReservation, {
            actualCents: actual,
            owner,
            reservedCents: last.reserveCents,
            reservedDayKey: last.dayKey
          })
        }
      }
    }
    for (let i = 1; i < reserves.length; i += 2) {
      const slot = reserves[i]
      if (slot?.ok) {
        const actual = (i * 11) % 100
        totalActual += actual
        await t.mutation(internal.ownerSpend.settleReservation, {
          actualCents: actual,
          owner,
          reservedCents: slot.reserveCents,
          reservedDayKey: slot.dayKey
        })
      }
    }
    const after = await totalCents(t, owner)
    expect(after.inflight).toBe(0)
    expect(after.centsToday).toBe(totalActual)
    expect(after.centsToday).toBeLessThanOrEqual(DAILY_CENTS_CAP)
  })
})
describe('ownerSpend books-balance fuzz', () => {
  test('100 random reserve+settle ops keep books balanced and within cap', async () => {
    const t = makeTest()
    const owner = 'fuzz@x'
    let seed = 0xc0_ff_ee
    const rand = (): number => {
      seed = Math.trunc(seed * 1_664_525 + 1_013_904_223)
      return seed / 0x1_00_00_00_00
    }
    interface Slot {
      dayKey: string
      reserveCents: number
    }
    const open: Slot[] = []
    let expectedTotal = 0
    let opsCompleted = 0
    for (let i = 0; i < 200 && opsCompleted < 100; i += 1) {
      const choose = rand()
      if (choose < 0.5 && open.length < 6) {
        const reserveCents = 50 + Math.floor(rand() * 150)
        const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: reserveCents, owner })
        if (r.ok) {
          open.push({ dayKey: r.dayKey, reserveCents })
          opsCompleted += 1
        }
      } else if (open.length > 0) {
        const idx = Math.floor(rand() * open.length)
        const slot = open.splice(idx, 1)[0]
        if (slot) {
          const actual = Math.floor(rand() * (slot.reserveCents + 50))
          expectedTotal += actual
          await t.mutation(internal.ownerSpend.settleReservation, {
            actualCents: actual,
            owner,
            reservedCents: slot.reserveCents,
            reservedDayKey: slot.dayKey
          })
          opsCompleted += 1
        }
      }
    }
    for (const slot of open) {
      const actual = Math.floor(rand() * slot.reserveCents)
      expectedTotal += actual
      await t.mutation(internal.ownerSpend.settleReservation, {
        actualCents: actual,
        owner,
        reservedCents: slot.reserveCents,
        reservedDayKey: slot.dayKey
      })
    }
    open.length = 0
    const after = await totalCents(t, owner)
    expect(after.inflight).toBe(0)
    expect(after.centsToday).toBeLessThanOrEqual(DAILY_CENTS_CAP)
    expect(after.centsToday).toBeGreaterThanOrEqual(0)
    expect(after.centsToday).toBeLessThanOrEqual(expectedTotal)
  })
})
describe('ownerSpend invariant guard', () => {
  beforeEach(() => {
    restoreNow()
  })
  test('reserveBudget rejection does not increment inflight', async () => {
    const t = makeTest()
    const owner = 'guard@x'
    await Promise.all(
      Array.from({ length: 8 }, async () => t.mutation(internal.ownerSpend.reserveBudget, { cents: 100, owner }))
    )
    const before = await totalCents(t, owner)
    const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 100, owner })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('inflight')
    const after = await totalCents(t, owner)
    expect(after.inflight).toBe(before.inflight)
    expect(after.centsToday).toBe(before.centsToday)
  })
})

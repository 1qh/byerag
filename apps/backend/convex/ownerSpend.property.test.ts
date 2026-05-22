import { afterEach, describe, expect, test } from 'bun:test'
import { makeTest } from '../test-utils/convex'
import { internal } from './_generated/api'

const DAILY_CENTS_CAP = 2500
const MAX_INFLIGHT_PER_OWNER = 8
const realDateNow = Date.now.bind(Date)
const setNow = (ms: number): void => {
  Date.now = (): number => ms
}
const restoreNow = (): void => {
  Date.now = realDateNow
}
class Lcg {
  private state: number
  public constructor(seed: number) {
    this.state = Math.trunc(seed)
  }
  public int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive)
  }
  public next(): number {
    this.state = Math.trunc(Math.trunc(this.state * 1_664_525 + 1_013_904_223))
    return this.state / 0x1_00_00_00_00
  }
}
const totals = async (
  t: ReturnType<typeof makeTest>,
  owner: string
): Promise<{ centsToday: number; inflight: number; rows: { centsToday: number; dayKey: string; inflight: number }[] }> =>
  t.run(async ctx => {
    const rows = await ctx.db
      .query('ownerSpend')
      .withIndex('by_owner', q => q.eq('owner', owner))
      .collect()
    return {
      centsToday: rows.reduce((acc, r) => acc + r.centsToday, 0),
      inflight: rows.reduce((acc, r) => acc + (r.inflight ?? 0), 0),
      rows: rows.map(r => ({ centsToday: r.centsToday, dayKey: r.dayKey, inflight: r.inflight ?? 0 }))
    }
  })
type Op =
  | { actualCents: number; index: number; kind: 'settle' }
  | { deltaMs: number; kind: 'tick' }
  | { kind: 'reserve'; reserveCents: number }
const generateTrajectory = (rng: Lcg, n: number): Op[] => {
  const ops: Op[] = []
  let openCount = 0
  for (let i = 0; i < n; i += 1) {
    const choice = rng.next()
    if (choice < 0.45 && openCount < 6) {
      ops.push({ kind: 'reserve', reserveCents: 50 + rng.int(150) })
      openCount += 1
    } else if (choice < 0.9 && openCount > 0) {
      ops.push({ actualCents: rng.int(300), index: rng.int(openCount), kind: 'settle' })
      openCount -= 1
    } else if (choice < 0.95) ops.push({ deltaMs: rng.int(48) * 60 * 60 * 1000, kind: 'tick' })
    else ops.push({ deltaMs: rng.int(120) * 60 * 1000, kind: 'tick' })
  }
  return ops
}
const runTrajectory = async (
  t: ReturnType<typeof makeTest>,
  owner: string,
  ops: Op[]
): Promise<{ totalActualCharged: number }> => {
  const open: { dayKey: string; reserveCents: number }[] = []
  let now = Date.UTC(2026, 3, 24, 12, 0, 0)
  setNow(now)
  let totalActualCharged = 0
  for (const op of ops)
    if (op.kind === 'reserve') {
      const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: op.reserveCents, owner })
      if (r.ok) open.push({ dayKey: r.dayKey, reserveCents: op.reserveCents })
    } else if (op.kind === 'settle' && open.length > 0) {
      const idx = Math.min(op.index, open.length - 1)
      const slot = open.splice(idx, 1)[0]
      if (slot) {
        const charged = Math.min(op.actualCents, DAILY_CENTS_CAP)
        totalActualCharged += charged
        await t.mutation(internal.ownerSpend.settleReservation, {
          actualCents: op.actualCents,
          owner,
          reservedCents: slot.reserveCents,
          reservedDayKey: slot.dayKey
        })
      }
    } else if (op.kind === 'tick') {
      now += op.deltaMs
      setNow(now)
    }
  for (const slot of open) {
    const actual = 0
    totalActualCharged += actual
    await t.mutation(internal.ownerSpend.settleReservation, {
      actualCents: actual,
      owner,
      reservedCents: slot.reserveCents,
      reservedDayKey: slot.dayKey
    })
  }
  return { totalActualCharged }
}
describe('ownerSpend property fuzz', () => {
  afterEach(() => {
    restoreNow()
  })
  test('1000 operations across 50 trajectories: inflight always returns to 0; centsToday non-negative', async () => {
    const SEED_BASE = 0xc0_ff_ee
    const TRAJECTORIES = 50
    const OPS_PER_TRAJECTORY = 20
    for (let s = 0; s < TRAJECTORIES; s += 1) {
      const t = makeTest()
      const owner = `prop-${s}@x`
      const rng = new Lcg(SEED_BASE + s)
      const ops = generateTrajectory(rng, OPS_PER_TRAJECTORY)
      await runTrajectory(t, owner, ops)
      const after = await totals(t, owner)
      expect(after.inflight).toBe(0)
      for (const row of after.rows) {
        expect(row.centsToday).toBeGreaterThanOrEqual(0)
        expect(row.inflight).toBe(0)
      }
      for (const row of after.rows) expect(row.centsToday).toBeLessThanOrEqual(DAILY_CENTS_CAP * 1.1)
    }
  })
  test('20 trajectories with heavy reserve+settle pressure stay bounded (single day)', async () => {
    for (let s = 0; s < 20; s += 1) {
      const t = makeTest()
      const owner = `heavy-${s}@x`
      const rng = new Lcg(0xde_ad_be_ef + s)
      const ops: Op[] = []
      for (let i = 0; i < 100; i += 1) {
        const c = rng.next()
        if (c < 0.5) ops.push({ kind: 'reserve', reserveCents: 100 + rng.int(200) })
        else ops.push({ actualCents: rng.int(400), index: rng.int(8), kind: 'settle' })
      }
      await runTrajectory(t, owner, ops)
      const after = await totals(t, owner)
      expect(after.inflight).toBe(0)
      for (const row of after.rows) expect(row.centsToday).toBeGreaterThanOrEqual(0)
    }
  })
  test('inflight cap is never breached during random concurrent reserves', async () => {
    const t = makeTest()
    const owner = 'inflight-prop@x'
    const rng = new Lcg(42)
    const reserves = await Promise.all(
      Array.from({ length: 20 }, async () =>
        t.mutation(internal.ownerSpend.reserveBudget, { cents: 50 + rng.int(150), owner })
      )
    )
    const accepted = reserves.filter(r => r.ok)
    expect(accepted.length).toBeLessThanOrEqual(MAX_INFLIGHT_PER_OWNER)
    const after = await totals(t, owner)
    expect(after.inflight).toBeLessThanOrEqual(MAX_INFLIGHT_PER_OWNER)
  })
  test('arbitrary refund cycle leaves zero books regardless of order', async () => {
    for (let s = 0; s < 10; s += 1) {
      const t = makeTest()
      const owner = `refund-${s}@x`
      const rng = new Lcg(s + 1)
      const reserves: { dayKey: string; reserveCents: number }[] = []
      for (let i = 0; i < 5; i += 1) {
        const cents = 50 + rng.int(150)
        const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents, owner })
        if (r.ok) reserves.push({ dayKey: r.dayKey, reserveCents: cents })
      }
      const order = reserves.map((_, i) => i).toSorted(() => rng.next() - 0.5)
      for (const idx of order) {
        const slot = reserves[idx]
        if (slot)
          await t.mutation(internal.ownerSpend.settleReservation, {
            actualCents: 0,
            owner,
            reservedCents: slot.reserveCents,
            reservedDayKey: slot.dayKey
          })
      }
      const after = await totals(t, owner)
      expect(after.inflight).toBe(0)
      expect(after.centsToday).toBe(0)
    }
  })
})

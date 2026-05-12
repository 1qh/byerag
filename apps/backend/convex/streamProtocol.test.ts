import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSubtype, StreamEvent } from './streamProtocol'
import { agentEventEnvelope, errorEventEnvelope, streamEvent } from './streamProtocol'
const protocolSrc = readFileSync(join(import.meta.dir, 'streamProtocol.ts'), 'utf8')
const TYPE_LITERAL_RE = /z\.literal\('(?<t>[a-z_]+)'\)/gu
const extractTypes = (src: string): Set<string> => {
  const out = new Set<string>()
  for (const m of src.matchAll(TYPE_LITERAL_RE)) if (m.groups?.t) out.add(m.groups.t)
  return out
}
const SUBTYPE_RE =
  /'(?<s>process_started|sandbox_connect|sandbox_connect_failed|sandbox_create|sandbox_ready|script_uploaded|start)'/gu
const extractSubtypes = (src: string): Set<string> => {
  const out = new Set<string>()
  for (const m of src.matchAll(SUBTYPE_RE)) if (m.groups?.s) out.add(m.groups.s)
  return out
}
describe('streamProtocol — protocol ↔ parser drift snapshot', () => {
  test('protocol streamEvent type literals match expected snapshot', () => {
    const expected = new Set([
      'agent',
      'assistant',
      'error',
      'rate_limit_event',
      'result',
      'stream_event',
      'system',
      'user'
    ])
    expect(extractTypes(protocolSrc)).toEqual(expected)
  })
  test('every protocol AgentSubtype is present in protocol union', () => {
    const subtypes = extractSubtypes(protocolSrc)
    const expected = new Set([
      'process_started',
      'sandbox_connect',
      'sandbox_connect_failed',
      'sandbox_create',
      'sandbox_ready',
      'script_uploaded',
      'start'
    ])
    expect(subtypes).toEqual(expected)
  })
  test('agentEventEnvelope wraps subtype + data with type=agent', () => {
    const t0 = Date.now() - 100
    const out = JSON.parse(agentEventEnvelope('start', t0, { foo: 'bar' })) as Record<string, unknown>
    expect(out.type).toBe('agent')
    expect(out.subtype).toBe('start')
    expect(out.foo).toBe('bar')
    expect(typeof out.elapsed).toBe('number')
    expect((out.elapsed as number) >= 100).toBe(true)
  })
  test('errorEventEnvelope serializes type=error + error string', () => {
    const out = JSON.parse(errorEventEnvelope('boom')) as Record<string, unknown>
    expect(out).toEqual({ error: 'boom', type: 'error' })
  })
  test('streamEvent zod schema accepts all branches', () => {
    const samples: { event: unknown; type: string }[] = [
      { event: { subtype: 'sandbox_ready', type: 'agent' }, type: 'agent' },
      { event: { subtype: 'init', type: 'system' }, type: 'system' },
      {
        event: { message: { content: [{ text: 'hi', type: 'text' }], role: 'assistant' }, type: 'assistant' },
        type: 'assistant'
      },
      { event: { message: { content: [{ text: 'q', type: 'text' }], role: 'user' }, type: 'user' }, type: 'user' },
      { event: { subtype: 'success', type: 'result' }, type: 'result' },
      { event: { type: 'rate_limit_event' }, type: 'rate_limit_event' },
      { event: { error: 'x', type: 'error' }, type: 'error' },
      { event: { type: 'stream_event' }, type: 'stream_event' }
    ]
    for (const { event, type } of samples) {
      const r = streamEvent.safeParse(event)
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.type).toBe(type as StreamEvent['type'])
    }
  })
  test('streamEvent rejects unknown type', () => {
    expect(streamEvent.safeParse({ type: 'never_added' }).success).toBe(false)
  })
  test('AgentSubtype TS type alias matches protocol union', () => {
    const fn: (s: AgentSubtype) => string = s => s
    const all: AgentSubtype[] = [
      'process_started',
      'sandbox_connect',
      'sandbox_connect_failed',
      'sandbox_create',
      'sandbox_ready',
      'script_uploaded',
      'start'
    ]
    for (const s of all) expect(fn(s)).toBe(s)
  })
})

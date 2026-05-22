/* eslint-disable complexity, @typescript-eslint/no-unnecessary-condition */
'use client'
import type { StreamEvent } from 'backend/convex/streamProtocol'
import { parseWithCache } from '@a/react/parsers'
import { Button } from '@a/ui/components/button'
import { useMemo, useState } from 'react'

const DebugPanel = ({
  events,
  sendTime
}: {
  events: { _creationTime: number; content: string }[]
  sendTime: null | number
}) => {
  const [open, setOpen] = useState(false)
  const [rawOpen, setRawOpen] = useState(false)
  const parsed = useMemo(
    () =>
      events.flatMap(e => {
        const ev = parseWithCache(e)
        return ev ? [{ ...ev, _t: e._creationTime }] : []
      }),
    [events]
  )
  const stats = useMemo(() => {
    let init: (Extract<StreamEvent, { type: 'system' }> & { _t: number }) | undefined
    let result: (Extract<StreamEvent, { type: 'result' }> & { _t: number }) | undefined
    let lastRate: (Extract<StreamEvent, { type: 'rate_limit_event' }> & { _t: number }) | undefined
    const assistants: (Extract<StreamEvent, { type: 'assistant' }> & { _t: number })[] = []
    const agentEvents: (Extract<StreamEvent, { type: 'agent' }> & { _t: number })[] = []
    let userCount = 0
    let totalIn = 0
    let totalOut = 0
    let totalCache = 0
    let thinkingCount = 0
    let toolUseCount = 0
    let svc: string | undefined
    let geo: string | undefined
    for (const e of parsed)
      if (e.type === 'system' && e.subtype === 'init' && !init) init = e
      else if (e.type === 'result') result = e
      else if (e.type === 'rate_limit_event') lastRate = e
      else if (e.type === 'user') userCount += 1
      else if (e.type === 'agent') agentEvents.push(e)
      else if (e.type === 'assistant') {
        assistants.push(e)
        const u = e.message?.usage
        if (u) {
          totalIn += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
          totalOut += u.output_tokens ?? 0
          totalCache += u.cache_read_input_tokens ?? 0
          if (!svc && u.service_tier) svc = u.service_tier
          if (!geo && u.inference_geo) geo = u.inference_geo
        }
        const content = e.message?.content ?? []
        if (content.some(b => b.type === 'thinking')) thinkingCount += 1
        if (content.some(b => b.type === 'tool_use')) toolUseCount += 1
      }
    const cacheRatio = totalIn > 0 ? ((totalCache / totalIn) * 100).toFixed(0) : '0'
    return {
      agentEvents,
      assistants,
      cacheRatio,
      geo: geo ?? '—',
      init,
      lastRate,
      result,
      svc: svc ?? '—',
      thinkingCount,
      toolUseCount,
      totalCache,
      totalIn,
      totalOut,
      userCount
    }
  }, [parsed])
  if (parsed.length === 0) return null
  const {
    init,
    result,
    assistants,
    agentEvents,
    userCount,
    totalIn,
    totalOut,
    totalCache,
    cacheRatio,
    thinkingCount,
    toolUseCount,
    svc,
    geo,
    lastRate
  } = stats
  const first = parsed[0]
  const last = parsed.at(-1)
  if (!(first && last)) return null
  const firstT = first._t
  const lastT = last._t
  const ttfe = sendTime ? ((firstT - sendTime) / 1000).toFixed(1) : '—'
  const ttotal = sendTime ? ((lastT - sendTime) / 1000).toFixed(1) : '—'
  return (
    <div className='border-t bg-muted text-xs font-mono'>
      <Button
        className='h-auto w-full justify-start rounded-none bg-transparent px-3 py-1 text-left text-muted-foreground hover:bg-transparent hover:text-foreground flex items-center gap-2 flex-wrap font-mono text-xs'
        onClick={() => setOpen(!open)}
        size='sm'
        variant='ghost'>
        <span>{open ? '▼' : '▶'}</span>
        <span>{parsed.length} events</span>
        {init?.model ? <span>· {init.model}</span> : null}
        {result?.result?.cost_usd !== null && result?.result?.cost_usd !== undefined && (
          <span>{`· $${result.result.cost_usd.toFixed(4)}`}</span>
        )}
        <span>
          · {totalIn}in {totalOut}out
        </span>
        <span>· {cacheRatio}% cache</span>
        {agentEvents.length > 0 && <span>· sandbox:{agentEvents.at(-1)?.action ?? '?'}</span>}
        <span>
          · {ttfe}s first · {ttotal}s total
        </span>
      </Button>
      {open ? (
        <div className='px-3 pb-2 space-y-1 max-h-80 overflow-y-auto text-muted-foreground'>
          {init ? (
            <>
              <div>
                session {init.session_id} · v{init.claude_code_version} · {init.permissionMode} · cwd: {init.cwd}
              </div>
              <div>
                tools ({init.tools?.length}): {init.tools?.join(', ')}
              </div>
              {(init.agents?.length ?? 0) > 0 && <div>agents: {init.agents?.join(', ')}</div>}
              {(init.mcp_servers?.length ?? 0) > 0 && <div>mcp: {JSON.stringify(init.mcp_servers)}</div>}
              <div>
                apiKeySource: {init.apiKeySource} · fastMode: {init.fast_mode_state}
              </div>
            </>
          ) : null}
          <div>
            {assistants.length} assistant · {toolUseCount} tool_use · {userCount} tool_result · {thinkingCount} thinking
          </div>
          <div>
            tokens: {totalIn} in ({totalCache} cached, {cacheRatio}%) · {totalOut} out · tier: {svc} · geo: {geo}
          </div>
          {lastRate?.rate_limit_info ? (
            <div>
              rate: {lastRate.rate_limit_info.status} · {lastRate.rate_limit_info.rateLimitType} · resets{' '}
              {new Date((lastRate.rate_limit_info.resetsAt ?? 0) * 1000).toLocaleTimeString()}
              {lastRate.rate_limit_info.isUsingOverage ? ' · OVERAGE' : ''}
            </div>
          ) : null}
          {result ? <div>{`result: ${result.subtype} · $${result.result?.cost_usd?.toFixed(6)}`}</div> : null}
          {agentEvents.length > 0 && (
            <div className='text-primary'>
              sandbox:{' '}
              {agentEvents
                .map(a => {
                  const parts = [
                    a.subtype ?? '',
                    a.action ? `(${a.action})` : '',
                    a.sandboxId?.slice(0, 8) ?? '',
                    a.elapsed === null || a.elapsed === undefined ? '' : `${a.elapsed}ms`
                  ].filter(Boolean)
                  return parts.join(' ')
                })
                .join(' → ')}
            </div>
          )}
          <div className='mt-1'>
            <Button
              className='h-auto rounded-none bg-transparent p-0 font-mono text-xs text-muted-foreground hover:bg-transparent hover:text-foreground/70 cursor-pointer'
              onClick={() => setRawOpen(!rawOpen)}
              size='sm'
              variant='ghost'>
              {rawOpen ? '▼' : '▶'} raw timeline
            </Button>
            {rawOpen ? (
              <pre className='mt-1 whitespace-pre-wrap break-all max-h-60 overflow-y-auto text-[10px] text-muted-foreground'>
                {parsed
                  .map(e => {
                    const dt = sendTime ? `+${((e._t - sendTime) / 1000).toFixed(1)}s` : ''
                    const sub = 'subtype' in e && e.subtype ? `/${e.subtype}` : ''
                    const extra: string[] = []
                    if (e.type === 'assistant' || e.type === 'user') {
                      const types = (e.message?.content ?? []).map(b => b.type).join(',')
                      if (types) extra.push(`[${types}]`)
                      if (e.message?.usage?.output_tokens) extra.push(`${e.message.usage.output_tokens}tok`)
                    }
                    if (e.type === 'error') extra.push(`err:${(e.error ?? '').slice(0, 50)}`)
                    if (e.type === 'agent') {
                      if (e.sandboxId) extra.push(e.sandboxId.slice(0, 12))
                      if (e.action) extra.push(e.action)
                      if (e.template) extra.push(e.template)
                      if (e.elapsed !== null && e.elapsed !== undefined) extra.push(`${e.elapsed}ms`)
                      if (e.model) extra.push(e.model)
                    }
                    return `${dt} ${e.type}${sub} ${extra.join(' ')}\n`
                  })
                  .join('')}
              </pre>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
export { DebugPanel }

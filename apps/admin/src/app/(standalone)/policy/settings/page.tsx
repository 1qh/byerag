'use client'
import { Button } from '@a/ui/components/button'
import { Textarea } from '@a/ui/components/textarea'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const PolicySettingsPage = (): React.ReactElement => {
  const current = useQuery(api.settings.getForAdmin, { key: 'corpus_policy' })
  const save = useMutation(api.settings.setForAdmin)
  const [text, setText] = useState<string>('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect -- sync server value into local edit state
    if (typeof current === 'string') setText(current)
  }, [current])
  if (current === undefined) return <div className='p-6'>Loading…</div>
  const onSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await save({ key: 'corpus_policy', value: text })
      toast.success('Policy saved — applies to future uploads')
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className='flex h-dvh flex-col'>
      <header className='flex items-center gap-4 border-b px-4 py-3'>
        <h1 className='font-semibold text-lg'>Policy</h1>
        <nav className='flex items-center gap-1 text-sm'>
          <Link className='rounded px-2 py-1 text-muted-foreground hover:bg-muted' href='/policy'>
            Queue
          </Link>
          <span className='rounded bg-muted px-2 py-1 font-medium'>Rules</span>
        </nav>
      </header>
      <section className='max-w-3xl space-y-3 p-6'>
        <h2 className='font-semibold text-lg'>Corpus policy</h2>
        <p className='text-muted-foreground text-sm'>
          The classifier checks every upload against these rules. Changes apply to future uploads only — currently rejected
          docs are not re-checked automatically (use Re-classify in the queue).
        </p>
        <Textarea
          aria-label='Corpus policy text'
          className='h-64 font-mono'
          onChange={e => setText(e.target.value)}
          value={text}
        />
        <Button
          disabled={saving || text === (current ?? '')}
          onClick={() => {
            // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
            onSave().catch((error: unknown) => toast.error(String(error)))
          }}
          type='button'>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </section>
    </div>
  )
}
export default PolicySettingsPage

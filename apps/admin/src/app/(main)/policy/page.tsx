'use client'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
const PolicyPage = (): React.ReactElement => {
  const current = useQuery(api.settings.getForAdmin, { key: 'corpus_policy' })
  const save = useMutation(api.settings.setForAdmin)
  const [text, setText] = useState<string>('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (typeof current === 'string') setText(current)
  }, [current])
  if (current === undefined) return <div className='p-6'>Loading…</div>
  const onSave = (): void => {
    setSaving(true)
    save({ key: 'corpus_policy', value: text })
      .catch((error: unknown) => alert(String(error)))
      .finally(() => setSaving(false))
  }
  return (
    <div className='space-y-3 p-6'>
      <h2 className='font-semibold text-lg'>Corpus policy</h2>
      <p className='text-muted-foreground text-sm'>
        Used by the policy classifier on every upload to accept/reject documents.
      </p>
      <textarea
        className='h-64 w-full rounded-md border bg-background p-3 font-mono text-sm'
        onChange={e => setText(e.target.value)}
        value={text}
      />
      <button
        className='rounded-md border bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50'
        disabled={saving || text === (current ?? '')}
        onClick={onSave}
        type='button'>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
export default PolicyPage

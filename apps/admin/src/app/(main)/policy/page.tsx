'use client'
import { Button } from '@a/ui/components/button'
import { Textarea } from '@a/ui/components/textarea'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const PolicyPage = (): React.ReactElement => {
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
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className='space-y-3 p-6'>
      <h2 className='font-semibold text-lg'>Corpus policy</h2>
      <p className='text-muted-foreground text-sm'>
        Used by the policy classifier on every upload to accept/reject documents.
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
          // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React event handler cannot be async (no-misused-promises); .catch is the documented byerag pattern
          onSave().catch((error: unknown) => toast.error(String(error)))
        }}
        type='button'>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </section>
  )
}
export default PolicyPage

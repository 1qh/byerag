'use client'
import { useMutation, useQuery } from 'convex/react'
import { api } from 'backend/convex/_generated/api'
import { use, useState } from 'react'
interface Snapshot { choicesShuffled: string[]; promptText: string; questionId: string }
const AttemptPage = ({ params }: { params: Promise<{ attemptId: string }> }): React.ReactElement => {
  const { attemptId } = use(params)
  const attempt = useQuery(api.trainingAttempts.getMyAttemptDetail, { attemptId: attemptId as never })
  const submit = useMutation(api.trainingAttempts.submitAttempt)
  const [answers, setAnswers] = useState<number[]>([])
  const [submitted, setSubmitted] = useState<{ passed: boolean; score: number } | null>(null)
  if (attempt === undefined) return <div className="p-6">Loading…</div>
  if (attempt === null) return <div className="p-6 text-destructive">Attempt not found or not yours.</div>
  if ('status' in attempt && attempt.status === 'passed') {
    type Full = { questionSnapshots: { choicesShuffled: string[]; correctIndexShuffled: number; promptText: string }[]; score: number }
    const full = attempt as unknown as Full
    return (
      <div className="space-y-4 p-6">
        <h2 className="font-semibold text-lg text-green-700">Passed — {full.score}/{full.questionSnapshots.length}</h2>
        {full.questionSnapshots.map((q, i) => (
          <div key={`${q.promptText}-${i}`} className="rounded-md border p-4 space-y-2">
            <div className="font-medium">{i + 1}. {q.promptText}</div>
            <ol className="list-decimal list-inside text-sm">
              {q.choicesShuffled.map((c, j) => (
                <li key={c} className={j === q.correctIndexShuffled ? 'font-semibold text-green-700' : ''}>{c}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    )
  }
  if ('total' in attempt) return <div className="p-6 text-muted-foreground">Score {attempt.score}/{attempt.total} — open-book retake from /training to see content.</div>
  type InProg = { questionSnapshots: Snapshot[]; status: string }
  const a = attempt as unknown as InProg
  const onPick = (i: number, j: number): void => { setAnswers(prev => { const n = [...prev]; n[i] = j; return n }) }
  const onSubmit = (): void => {
    submit({ answers, attemptId: attemptId as never })
      .then(r => setSubmitted(r))
      .catch(e => {
        // eslint-disable-next-line no-console
        console.error('submit failed', e)
      })
  }
  if (submitted) return (
    <div className={`p-6 font-semibold text-lg ${submitted.passed ? 'text-green-700' : 'text-destructive'}`}>
      {submitted.passed ? `✓ Passed (${submitted.score}/${a.questionSnapshots.length})` : `✗ Failed (${submitted.score}/${a.questionSnapshots.length}) — retake from /training`}
    </div>
  )
  return (
    <div className="space-y-4 p-6">
      <h2 className="font-semibold text-lg">Attempt — {a.questionSnapshots.length} questions</h2>
      {a.questionSnapshots.map((q, i) => (
        <div key={q.questionId} className="rounded-md border p-4 space-y-2">
          <div className="font-medium">{i + 1}. {q.promptText}</div>
          <div className="space-y-1">
            {q.choicesShuffled.map((c, j) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="radio" name={`q${i}`} value={j} checked={answers[i] === j} onChange={() => onPick(i, j)} />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="rounded-md border bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        disabled={answers.length !== a.questionSnapshots.length || answers.some(x => x === undefined)}
        onClick={onSubmit}>Submit</button>
    </div>
  )
}
export default AttemptPage

const CSV_ESCAPE_RE = /[",\n]/u
const csvEscape = (s: string): string => (CSV_ESCAPE_RE.test(s) ? `"${s.replaceAll('"', '""')}"` : s)
const csvCell = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}
const downloadCsv = (rows: Record<string, unknown>[], filename: string): void => {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0] ?? {})
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map(h => csvEscape(csvCell(r[h]))).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
export { downloadCsv }

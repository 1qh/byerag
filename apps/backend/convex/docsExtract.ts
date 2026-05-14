/* eslint-disable @typescript-eslint/no-deprecated, unicorn/prefer-ternary, unicorn/no-new-array, unicorn/prefer-array-find */
/** biome-ignore-all lint/nursery/noContinue: control flow shape */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/performance/useTopLevelRegex: scoped regex ok */
/** biome-ignore-all lint/style/useExplicitLengthCheck: idiomatic */
/** biome-ignore-all lint/correctness/noUnusedVariables: pending feature */
/** biome-ignore-all lint/suspicious/useAwait: sandbox lifecycle wraps callbacks */
'use node'
import { v } from 'convex/values'
import { Buffer } from 'node:buffer'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { createSandbox } from './sandboxClient'
const OCR_TRIGGER_THRESHOLD = 100
const PDF_TIMEOUT_MS = 60_000
const OCR_TIMEOUT_MS = 300_000
const PANDOC_TIMEOUT_MS = 60_000
const RAW_MIME_PREFIXES = ['text/', 'application/json', 'application/xml']
const PANDOC_MIMES: Record<string, string> = {
  'application/epub+zip': 'epub',
  'application/rtf': 'rtf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
}
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/tiff', 'image/webp'])
const CJK_RE = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u
const VIET_DIACRITIC_RE = /[ăâđêôơưĂÂĐÊÔƠƯ]/u
const detectLang = (sample: string): string => {
  if (CJK_RE.test(sample)) return 'mixed'
  if (VIET_DIACRITIC_RE.test(sample)) return 'vi'
  return 'en'
}
interface ExtractTarget {
  filename: string
  mime: string
  storageId: string
}
const extract = internalAction({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<{ extracted: boolean; reason?: string }> => {
    const target = (await ctx.runQuery(internal.docs.getForExtract, { docId })) as ExtractTarget | null
    if (!target) return { extracted: false, reason: 'no-storage' }
    const blob = await ctx.storage.get(target.storageId)
    if (!blob) return { extracted: false, reason: 'blob-missing' }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const sandbox = await createSandbox('', {})
    try {
      const ext = target.filename.split('.').pop()?.toLowerCase() ?? 'bin'
      const inputPath = `/tmp/extract-${docId}.${ext}`
      await sandbox.files.write(inputPath, bytes)
      let text = ''
      if (target.mime === 'application/pdf') {
        const r = await sandbox.commands.run(`pdftotext -layout -nopgbrk '${inputPath}' -`, { timeoutMs: PDF_TIMEOUT_MS })
        text = r.stdout
        if (text.length < OCR_TRIGGER_THRESHOLD) {
          const ocrDir = `/tmp/ocr-${docId}`
          const ocr = await sandbox.commands.run(
            `mkdir -p '${ocrDir}' && pdftoppm -r 200 '${inputPath}' '${ocrDir}/page' && for img in ${ocrDir}/page-*.ppm; do tesseract -l eng+vie "$img" - 2>/dev/null; done`,
            { timeoutMs: OCR_TIMEOUT_MS }
          )
          text = ocr.stdout
        }
      } else if (PANDOC_MIMES[target.mime]) {
        const fmt = PANDOC_MIMES[target.mime]
        const r = await sandbox.commands.run(`pandoc -f ${fmt} -t plain '${inputPath}'`, { timeoutMs: PANDOC_TIMEOUT_MS })
        text = r.stdout
      } else if (IMAGE_MIMES.has(target.mime)) {
        const r = await sandbox.commands.run(`tesseract -l eng+vie '${inputPath}' -`, { timeoutMs: OCR_TIMEOUT_MS })
        text = r.stdout
      } else if (RAW_MIME_PREFIXES.some(p => target.mime.startsWith(p))) text = Buffer.from(bytes).toString('utf8')
      else return { extracted: false, reason: `unsupported-mime:${target.mime}` }
      const trimmed = text.trim()
      if (trimmed.length === 0) return { extracted: false, reason: 'empty-extract' }
      const lang = detectLang(trimmed.slice(0, 4096))
      await ctx.runMutation(internal.docs.setExtracted, { docId, extractedText: trimmed, lang })
      return { extracted: true }
    } finally {
      await sandbox.kill()
    }
  }
})
export { extract }

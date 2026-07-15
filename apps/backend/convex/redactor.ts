const SECRET_PATTERNS: readonly string[] = [
  'sk-ant-[A-Za-z0-9_-]{8,}',
  'eyJ[A-Za-z0-9._-]{20,}',
  String.raw`\bsk-[A-Za-z0-9_-]{20,}`,
  String.raw`\bAKIA[0-9A-Z]{16}\b`,
  String.raw`\bgh[opsu]_[A-Za-z0-9]{36,}`,
  String.raw`\bAIza[0-9A-Za-z_-]{35}\b`,
  String.raw`\be2b_[A-Za-z0-9_-]{8,}`
]
const COMBINED_RE = new RegExp(SECRET_PATTERNS.join('|'), 'giu')
const redactSecrets = (s: string): string => s.replaceAll(COMBINED_RE, '[REDACTED]')
export { redactSecrets, SECRET_PATTERNS }

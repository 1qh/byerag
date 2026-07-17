const SECRET_PATTERNS: readonly string[] = [
  String.raw`sk-ant-[\w-]{8,}`,
  String.raw`eyJ[\w.-]{20,}`,
  String.raw`\bsk-[\w-]{20,}`,
  String.raw`\bAKIA[0-9A-Z]{16}\b`,
  String.raw`\bgh[opsu]_[a-z0-9]{36,}`,
  String.raw`\bAIza[\w-]{35}\b`,
  String.raw`\be2b_[\w-]{8,}`
]
const COMBINED_RE = new RegExp(SECRET_PATTERNS.join('|'), 'giu')
const redactSecrets = (s: string): string => s.replaceAll(COMBINED_RE, '[REDACTED]')
export { redactSecrets, SECRET_PATTERNS }

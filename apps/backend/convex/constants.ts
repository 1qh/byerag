const CLAUDE_MODEL = 'kimi-for-coding'
const CLAUDE_EFFORT = 'low'
const CLAUDE_MAX_BUDGET_USD = '1'
const CLAUDE_MAX_TURNS = '50'
const VALID_CHATID_RE = /^[a-z0-9]{24,64}$/u
const DISALLOWED_CHATID_CHAR_RE = /[^a-zA-Z0-9_-]/u
const SEQ_SERVER_ERROR = -1
const SEQ_SANDBOX_ERROR = 100_000
const WORKSPACE_PATH = '/workspace'
const CLAUDE_SESSIONS_PATH = '/home/agent/.claude-sessions'
const CLAUDE_TMP_PATH = '/home/agent/.claude-tmp'
const CLAUDE_SHARED_MEMORY_PATH = '/home/agent/.claude-shared-memory'
const MAX_CONCURRENT_AGENTS = 3
const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000
const STREAMING_TIMEOUT_MS = 10 * 60 * 1000
const MAX_CONTENT_LENGTH = 32_000
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024
const MAX_READ_SIZE_TEXT = 5 * 1024 * 1024
const MAX_READ_SIZE_BINARY = 3 * 1024 * 1024
const BINARY_EXTENSIONS = new Set([
  '7z',
  'a',
  'avi',
  'bz2',
  'class',
  'dll',
  'doc',
  'docx',
  'dylib',
  'eot',
  'exe',
  'gif',
  'gz',
  'ico',
  'jpeg',
  'jpg',
  'mov',
  'mp3',
  'mp4',
  'o',
  'otf',
  'pdf',
  'png',
  'pptx',
  'pyc',
  'so',
  'svg',
  'tar',
  'ttf',
  'wasm',
  'wav',
  'webp',
  'woff',
  'woff2',
  'xls',
  'xlsx',
  'xz',
  'zip'
])
export {
  BINARY_EXTENSIONS,
  CLAUDE_EFFORT,
  CLAUDE_MAX_BUDGET_USD,
  CLAUDE_MAX_TURNS,
  CLAUDE_MODEL,
  CLAUDE_SESSIONS_PATH,
  CLAUDE_SHARED_MEMORY_PATH,
  CLAUDE_TMP_PATH,
  DISALLOWED_CHATID_CHAR_RE,
  MAX_CONCURRENT_AGENTS,
  MAX_CONTENT_LENGTH,
  MAX_READ_SIZE_BINARY,
  MAX_READ_SIZE_TEXT,
  MAX_UPLOAD_SIZE,
  SANDBOX_TIMEOUT_MS,
  SEQ_SANDBOX_ERROR,
  SEQ_SERVER_ERROR,
  STREAMING_TIMEOUT_MS,
  VALID_CHATID_RE,
  WORKSPACE_PATH
}

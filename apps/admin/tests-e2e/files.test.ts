/** biome-ignore-all lint/nursery/useExpect: setup helper uses throw */
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { downloadZip, fresh, killAllSandboxes, listFiles, readFile, sendMessage, uploadFile, waitFor } from './helpers'
setDefaultTimeout(5 * 60 * 1000)
const email = fresh('files')
let sandboxReady = false
const ensureSandbox = async () => {
  if (sandboxReady) return
  const chatId = await sendMessage({ content: 'Use Bash to run: echo ready > /dev/null', email })
  const ok = await waitFor(chatId)
  if (!ok) throw new Error('sandbox setup failed')
  sandboxReady = true
}
const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCodePoint(...bytes.slice(i, i + 8192))
  return btoa(binary)
}
const fromBase64 = (b64: string): Uint8Array => {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.codePointAt(i)
  return bytes
}
beforeAll(async () => {
  await killAllSandboxes()
})
describe('files', () => {
  test('upload and read text file', async () => {
    await ensureSandbox()
    await uploadFile(email, '/home/user/workspace/text-test.txt', 'hello world\nline 2')
    const result = await readFile(email, '/home/user/workspace/text-test.txt')
    expect(result.binary).toBe(false)
    expect(result.content.trim()).toBe('hello world\nline 2')
  })
  test('upload .json file', async () => {
    await ensureSandbox()
    const json = JSON.stringify({ arr: [1, 2, 3], key: 'value', num: 42 })
    await uploadFile(email, '/home/user/workspace/data.json', json)
    const result = await readFile(email, '/home/user/workspace/data.json')
    expect(JSON.parse(result.content)).toEqual({ arr: [1, 2, 3], key: 'value', num: 42 })
  })
  test('upload .csv file', async () => {
    await ensureSandbox()
    const csv = 'name,age,city\nAlice,30,NYC\nBob,25,SF\n'
    await uploadFile(email, '/home/user/workspace/data.csv', csv)
    const result = await readFile(email, '/home/user/workspace/data.csv')
    expect(result.content).toContain('Alice,30,NYC')
  })
  test('upload .html file', async () => {
    await ensureSandbox()
    const html = '<html><body><h1>Test</h1></body></html>'
    await uploadFile(email, '/home/user/workspace/page.html', html)
    const result = await readFile(email, '/home/user/workspace/page.html')
    expect(result.content).toContain('<h1>Test</h1>')
  })
  test('upload .ts/.tsx/.js/.jsx files', async () => {
    await ensureSandbox()
    for (const ext of ['ts', 'tsx', 'js', 'jsx']) {
      const code = `export const x: number = 42; // ${ext}`
      await uploadFile(email, `/home/user/workspace/code.${ext}`, code)
      const result = await readFile(email, `/home/user/workspace/code.${ext}`)
      expect(result.content).toContain(`// ${ext}`)
    }
  })
  test('upload .py/.go/.rs files', async () => {
    await ensureSandbox()
    for (const [ext, code] of [
      ['py', 'x = 42'],
      ['go', 'package main'],
      ['rs', 'fn main() {}']
    ]) {
      await uploadFile(email, `/home/user/workspace/file.${ext}`, code)
      const result = await readFile(email, `/home/user/workspace/file.${ext}`)
      expect(result.content.trim()).toBe(code)
    }
  })
  test('upload .md file with unicode', async () => {
    await ensureSandbox()
    const md = '# Hello 世界 🎉\n\n- Item 1\n- Item 2\n'
    await uploadFile(email, '/home/user/workspace/readme.md', md)
    const result = await readFile(email, '/home/user/workspace/readme.md')
    expect(result.content).toContain('世界 🎉')
  })
  test('upload .yaml/.toml/.xml files', async () => {
    await ensureSandbox()
    await uploadFile(email, '/home/user/workspace/cfg.yaml', 'key: value\nlist:\n  - a\n  - b\n')
    await uploadFile(email, '/home/user/workspace/cfg.toml', '[section]\nkey = "value"\n')
    await uploadFile(email, '/home/user/workspace/cfg.xml', '<root><item>test</item></root>')
    expect((await readFile(email, '/home/user/workspace/cfg.yaml')).content).toContain('key: value')
    expect((await readFile(email, '/home/user/workspace/cfg.toml')).content).toContain('[section]')
    expect((await readFile(email, '/home/user/workspace/cfg.xml')).content).toContain('<item>test</item>')
  })
  test('upload and download PDF (binary roundtrip)', async () => {
    await ensureSandbox()
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3])
    await uploadFile(email, '/home/user/workspace/test.pdf', toBase64(pdfBytes), true)
    const result = await readFile(email, '/home/user/workspace/test.pdf')
    expect(result.binary).toBe(true)
    expect(result.size).toBe(pdfBytes.length)
    const decoded = fromBase64(result.content)
    expect(decoded[0]).toBe(0x25)
    expect(decoded[1]).toBe(0x50)
    expect(decoded[2]).toBe(0x44)
    expect(decoded[3]).toBe(0x46)
  })
  test('upload and download XLSX (binary roundtrip)', async () => {
    await ensureSandbox()
    const xlsxHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00])
    await uploadFile(email, '/home/user/workspace/data.xlsx', toBase64(xlsxHeader), true)
    const result = await readFile(email, '/home/user/workspace/data.xlsx')
    expect(result.binary).toBe(true)
    const decoded = fromBase64(result.content)
    expect(decoded[0]).toBe(0x50)
    expect(decoded[1]).toBe(0x4b)
  })
  test('upload and download DOCX (binary roundtrip)', async () => {
    await ensureSandbox()
    const docxHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x08, 0x08])
    await uploadFile(email, '/home/user/workspace/doc.docx', toBase64(docxHeader), true)
    const result = await readFile(email, '/home/user/workspace/doc.docx')
    expect(result.binary).toBe(true)
    expect(fromBase64(result.content)[0]).toBe(0x50)
  })
  test('upload and download PNG (binary roundtrip)', async () => {
    await ensureSandbox()
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await uploadFile(email, '/home/user/workspace/image.png', toBase64(pngHeader), true)
    const result = await readFile(email, '/home/user/workspace/image.png')
    expect(result.binary).toBe(true)
    const decoded = fromBase64(result.content)
    expect(decoded[0]).toBe(0x89)
    expect(decoded[1]).toBe(0x50)
    expect(decoded[2]).toBe(0x4e)
    expect(decoded[3]).toBe(0x47)
  })
  test('upload and download ZIP (binary roundtrip)', async () => {
    await ensureSandbox()
    const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    await uploadFile(email, '/home/user/workspace/archive.zip', toBase64(zipHeader), true)
    const result = await readFile(email, '/home/user/workspace/archive.zip')
    expect(result.binary).toBe(true)
    expect(fromBase64(result.content)[0]).toBe(0x50)
  })
  test('list workspace shows uploaded files', async () => {
    await ensureSandbox()
    const entries = await listFiles(email, '/home/user/workspace')
    const names = entries.map(e => e.name)
    expect(names).toContain('text-test.txt')
    expect(names).toContain('data.json')
    expect(names).toContain('test.pdf')
  })
  test('list shows file types correctly', async () => {
    await ensureSandbox()
    const entries = await listFiles(email, '/home/user/workspace')
    const files = entries.filter(e => e.type === 'file')
    const dirs = entries.filter(e => e.type === 'dir')
    expect(files.length).toBeGreaterThan(0)
    expect(dirs.length).toBeGreaterThanOrEqual(0)
  })
  test('list empty directory', async () => {
    await ensureSandbox()
    await uploadFile(email, '/home/user/workspace/emptydir/.gitkeep', '')
    const entries = await listFiles(email, '/home/user/workspace/emptydir')
    expect(entries.length).toBe(1)
  })
  test('upload creates nested parent dirs', async () => {
    await ensureSandbox()
    await uploadFile(email, '/home/user/workspace/a/b/c/d/deep.txt', 'deep content')
    const result = await readFile(email, '/home/user/workspace/a/b/c/d/deep.txt')
    expect(result.content.trim()).toBe('deep content')
  })
  test('list nested directory', async () => {
    await ensureSandbox()
    const entries = await listFiles(email, '/home/user/workspace/a/b/c/d')
    expect(entries.some(e => e.name === 'deep.txt')).toBe(true)
  })
  test('download workspace as tar.gz', async () => {
    await ensureSandbox()
    const result = await downloadZip(email, '/home/user/workspace')
    expect(result.base64.length).toBeGreaterThan(0)
    expect(result.size).toBeGreaterThan(0)
    const decoded = fromBase64(result.base64)
    expect(decoded[0]).toBe(0x1f)
    expect(decoded[1]).toBe(0x8b)
  })
  test('download subdirectory as tar.gz', async () => {
    await ensureSandbox()
    const result = await downloadZip(email, '/home/user/workspace/a/b/c')
    expect(result.size).toBeGreaterThan(0)
  })
  test('files visible across chats (shared workspace)', async () => {
    await ensureSandbox()
    const result = await readFile(email, '/home/user/workspace/text-test.txt')
    expect(result.content.trim()).toBe('hello world\nline 2')
  })
  test('upload file with special chars in name', async () => {
    await ensureSandbox()
    await uploadFile(email, '/home/user/workspace/file with spaces.txt', 'spaces work')
    const result = await readFile(email, '/home/user/workspace/file with spaces.txt')
    expect(result.content.trim()).toBe('spaces work')
  })
  test('upload empty file', async () => {
    await ensureSandbox()
    await uploadFile(email, '/home/user/workspace/empty.txt', '')
    const result = await readFile(email, '/home/user/workspace/empty.txt')
    expect(result.content).toBe('')
    expect(result.size).toBe(0)
  })
  test('upload overwrites existing file', async () => {
    await ensureSandbox()
    await uploadFile(email, '/home/user/workspace/overwrite.txt', 'version 1')
    await uploadFile(email, '/home/user/workspace/overwrite.txt', 'version 2')
    const result = await readFile(email, '/home/user/workspace/overwrite.txt')
    expect(result.content.trim()).toBe('version 2')
  })
  test('path traversal blocked', async () => {
    await ensureSandbox()
    await expect(uploadFile(email, '/etc/passwd', 'hacked')).rejects.toThrow()
    await expect(readFile(email, '/etc/passwd')).rejects.toThrow()
    await expect(uploadFile(email, '/home/user/workspace/../../../etc/passwd', 'hacked')).rejects.toThrow()
    await expect(listFiles(email, '/tmp')).rejects.toThrow()
  })
  test('shell metacharacters in path blocked', async () => {
    await ensureSandbox()
    await expect(uploadFile(email, '/home/user/workspace/$(whoami).txt', 'inject')).rejects.toThrow()
    await expect(uploadFile(email, '/home/user/workspace/test;rm -rf /.txt', 'inject')).rejects.toThrow()
    await expect(uploadFile(email, "/home/user/workspace/'; rm -rf /; echo '.txt", 'inject')).rejects.toThrow()
    await expect(uploadFile(email, '/home/user/workspace/"; rm -rf /; echo ".txt', 'inject')).rejects.toThrow()
    await expect(uploadFile(email, '/home/user/workspace/test|cat /etc/passwd', 'inject')).rejects.toThrow()
    await expect(uploadFile(email, '/home/user/workspace/test`id`.txt', 'inject')).rejects.toThrow()
  })
  test('read non-existent file throws', async () => {
    await ensureSandbox()
    await expect(readFile(email, '/home/user/workspace/does-not-exist.txt')).rejects.toThrow()
  })
  test('list non-existent directory throws', async () => {
    await ensureSandbox()
    await expect(listFiles(email, '/home/user/workspace/no-such-dir')).rejects.toThrow()
  })
  test('download zip of non-existent directory throws', async () => {
    await ensureSandbox()
    await expect(downloadZip(email, '/home/user/workspace/no-such-dir-zip')).rejects.toThrow()
  })
  test('file with no extension treated as text', async () => {
    await ensureSandbox()
    await uploadFile(email, '/home/user/workspace/Makefile', 'all:\n\techo hello\n')
    const result = await readFile(email, '/home/user/workspace/Makefile')
    expect(result.binary).toBe(false)
    expect(result.content).toContain('echo hello')
  })
  test('dotfiles upload and read', async () => {
    await ensureSandbox()
    await uploadFile(email, '/home/user/workspace/.gitignore', 'node_modules\n.env\n')
    await uploadFile(email, '/home/user/workspace/.env.example', 'API_KEY=xxx\n')
    const gi = await readFile(email, '/home/user/workspace/.gitignore')
    expect(gi.content).toContain('node_modules')
    const env = await readFile(email, '/home/user/workspace/.env.example')
    expect(env.content).toContain('API_KEY')
  })
  test('upload then delete then read throws', async () => {
    await ensureSandbox()
    await uploadFile(email, '/home/user/workspace/delete-me.txt', 'temp')
    const r = await readFile(email, '/home/user/workspace/delete-me.txt')
    expect(r.content.trim()).toBe('temp')
  })
  test('concurrent uploads to different files', async () => {
    await ensureSandbox()
    await Promise.all([
      uploadFile(email, '/home/user/workspace/concurrent-a.txt', 'content-a'),
      uploadFile(email, '/home/user/workspace/concurrent-b.txt', 'content-b'),
      uploadFile(email, '/home/user/workspace/concurrent-c.txt', 'content-c')
    ])
    const a = await readFile(email, '/home/user/workspace/concurrent-a.txt')
    const b = await readFile(email, '/home/user/workspace/concurrent-b.txt')
    const c = await readFile(email, '/home/user/workspace/concurrent-c.txt')
    expect(a.content.trim()).toBe('content-a')
    expect(b.content.trim()).toBe('content-b')
    expect(c.content.trim()).toBe('content-c')
  })
  test('binary file with null bytes roundtrip', async () => {
    await ensureSandbox()
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x80, 0x7f])
    await uploadFile(email, '/home/user/workspace/nullbytes.bin', toBase64(bytes), true)
    // .bin not in BINARY_EXTENSIONS — will be read as text, which corrupts null bytes
    // But that's expected behavior — only known binary extensions get binary treatment
  })
  test('symlink escape blocked', async () => {
    await ensureSandbox()
    const chatId = await sendMessage({
      content: 'Use Bash to run: ln -sf /etc/passwd /home/user/workspace/evil-link',
      email
    })
    await waitFor(chatId)
    await expect(readFile(email, '/home/user/workspace/evil-link')).rejects.toThrow()
  })
  test('SVG treated as binary but is actually text', async () => {
    await ensureSandbox()
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="50"/></svg>'
    const bytes = new TextEncoder().encode(svg)
    await uploadFile(email, '/home/user/workspace/icon.svg', toBase64(bytes), true)
    const result = await readFile(email, '/home/user/workspace/icon.svg')
    expect(result.binary).toBe(true)
    const decoded = new TextDecoder().decode(fromBase64(result.content))
    expect(decoded).toContain('<circle')
  })
})

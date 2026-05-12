/** biome-ignore-all lint/nursery/noContinue: walker */
/* eslint-disable no-continue */
import ts from 'typescript'
const DEFINE_RE = /^define(?<kind>Tool|Query|Mutation)$/u
interface ExtractedMeta {
  argDescriptions: Record<string, string>
  deprecated?: string
  description: string
  examples: string[]
  version: number
}
const readString = (node: ts.Expression | undefined): string | undefined => {
  if (!node) return
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
}
const readStringArray = (node: ts.Expression | undefined): string[] | undefined => {
  if (!(node && ts.isArrayLiteralExpression(node))) return
  const out: string[] = []
  for (const el of node.elements) {
    const s = readString(el)
    if (s !== undefined) out.push(s)
  }
  return out
}
const readNumber = (node: ts.Expression | undefined): number | undefined => {
  if (node && ts.isNumericLiteral(node)) return Number(node.text)
}
const readObject = (node: ts.Expression | undefined): ts.ObjectLiteralExpression | undefined => {
  if (node && ts.isObjectLiteralExpression(node)) return node
}
const findProp = (obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined => {
  for (const p of obj.properties)
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name) return p.initializer
}
const extractArgDescriptions = (defineArgs: ts.ObjectLiteralExpression): Record<string, string> => {
  const out: Record<string, string> = {}
  const argsObj = readObject(findProp(defineArgs, 'args'))
  if (!argsObj) return out
  for (const p of argsObj.properties) {
    if (!(ts.isPropertyAssignment(p) && ts.isIdentifier(p.name))) continue
    const call = p.initializer
    if (!ts.isCallExpression(call)) continue
    const optsArg = call.arguments.find(ts.isObjectLiteralExpression)
    if (!optsArg) continue
    const desc = readString(findProp(optsArg, 'description'))
    if (desc) out[p.name.text] = desc
  }
  return out
}
const findDefineCall = (source: ts.SourceFile): ts.CallExpression | undefined => {
  let found: ts.CallExpression | undefined
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && DEFINE_RE.test(node.expression.text)) found = node
    else ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}
const extractMeta = (toolFiles: string[]): Map<string, ExtractedMeta> => {
  const out = new Map<string, ExtractedMeta>()
  for (const file of toolFiles) {
    const text = ts.sys.readFile(file)
    if (!text) continue
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    const call = findDefineCall(source)
    const defineArgs = call?.arguments[0]
    if (!(defineArgs && ts.isObjectLiteralExpression(defineArgs))) continue
    const description = readString(findProp(defineArgs, 'description')) ?? ''
    const examples = readStringArray(findProp(defineArgs, 'examples')) ?? []
    const version = readNumber(findProp(defineArgs, 'version')) ?? 1
    const deprecated = readString(findProp(defineArgs, 'deprecated'))
    out.set(file, {
      argDescriptions: extractArgDescriptions(defineArgs),
      ...(deprecated ? { deprecated } : {}),
      description,
      examples,
      version
    })
  }
  return out
}
export { extractMeta }
export type { ExtractedMeta }

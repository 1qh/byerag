/** biome-ignore-all lint/complexity/useSimplifiedLogicExpression: ts.TypeFlags bitwise tests */
/** biome-ignore-all lint/nursery/noContinue: recursive walker */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: ts.TypeFlags needs bitwise */
/* eslint-disable complexity, no-bitwise, no-continue, @typescript-eslint/no-unnecessary-condition */
/* oxlint-disable eslint(complexity), eslint(no-bitwise) */
import { resolve } from 'node:path'
import ts from 'typescript'
interface Extracted {
  args: null | SchemaNode
  jsdoc: null | string
  schema: SchemaNode
}
type SchemaNode =
  | { element: SchemaNode; kind: 'array' }
  | { kind: 'boolean' }
  | { kind: 'enum'; values: string[] }
  | { kind: 'null' }
  | { kind: 'number' }
  | { kind: 'object'; shape: Record<string, { optional: boolean; schema: SchemaNode }> }
  | { kind: 'string' }
  | { kind: 'union'; members: SchemaNode[] }
  | { kind: 'unknown'; text?: string }
const extractSchemas = (toolFiles: string[]): Map<string, Extracted> => {
  const cfgPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists.bind(ts.sys), 'tsconfig.json')
  if (!cfgPath) throw new Error('tsconfig.json not found')
  const parsed = ts.parseJsonConfigFileContent(
    ts.readConfigFile(cfgPath, ts.sys.readFile.bind(ts.sys)).config,
    ts.sys,
    resolve(cfgPath, '..')
  )
  const program = ts.createProgram({ options: parsed.options, rootNames: parsed.fileNames })
  const checker = program.getTypeChecker()
  const typeToSchema = (type: ts.Type, depth = 0): SchemaNode => {
    if (depth > 12) return { kind: 'unknown', text: '<too deep>' }
    const { flags } = type
    if (flags & ts.TypeFlags.StringLiteral) return { kind: 'enum', values: [(type as ts.StringLiteralType).value] }
    if (flags & ts.TypeFlags.String) return { kind: 'string' }
    if (flags & ts.TypeFlags.Number || flags & ts.TypeFlags.NumberLiteral) return { kind: 'number' }
    if (flags & ts.TypeFlags.Boolean || flags & ts.TypeFlags.BooleanLike) return { kind: 'boolean' }
    if (flags & ts.TypeFlags.Null) return { kind: 'null' }
    if (flags & ts.TypeFlags.Undefined) return { kind: 'unknown', text: 'undefined' }
    if (type.isUnion()) {
      const nonUndef = type.types.filter(t => !(t.flags & ts.TypeFlags.Undefined))
      const [onlyMember] = nonUndef
      if (nonUndef.length === 1 && onlyMember) return typeToSchema(onlyMember, depth + 1)
      const parts = nonUndef.map(t => typeToSchema(t, depth + 1))
      if (parts.every(p => p.kind === 'enum'))
        return { kind: 'enum', values: [...new Set(parts.flatMap(p => (p.kind === 'enum' ? p.values : [])))].toSorted() }
      if (parts.every(p => p.kind === 'object')) {
        const merged: Record<string, { optional: boolean; schema: SchemaNode }> = {}
        const allKeys = new Set(parts.flatMap(p => (p.kind === 'object' ? Object.keys(p.shape) : [])))
        for (const k of allKeys) {
          const present = parts.filter(p => p.kind === 'object' && k in p.shape)
          const optional =
            present.length < parts.length || present.some(p => p.kind === 'object' && p.shape[k]?.optional === true)
          const schemas = present.map(p =>
            p.kind === 'object' ? (p.shape[k]?.schema ?? { kind: 'unknown' as const }) : { kind: 'unknown' as const }
          )
          if (schemas.length > 0 && schemas.every(s => s.kind === 'enum'))
            merged[k] = {
              optional,
              schema: {
                kind: 'enum',
                values: [...new Set(schemas.flatMap(s => (s.kind === 'enum' ? s.values : [])))].toSorted()
              }
            }
          else {
            const unique = [...new Map(schemas.map(s => [JSON.stringify(s), s])).values()]
            const [first] = unique
            merged[k] = {
              optional,
              schema:
                unique.length === 1 && first
                  ? first
                  : unique.length > 1
                    ? { kind: 'union', members: unique }
                    : { kind: 'unknown' }
            }
          }
        }
        return { kind: 'object', shape: merged }
      }
      return { kind: 'union', members: parts }
    }
    const typeArguments = checker.getTypeArguments(type as ts.TypeReference)
    const symbol = type.getSymbol()
    const [firstTypeArg] = typeArguments
    if ((symbol?.name === 'Array' || symbol?.name === 'ReadonlyArray') && typeArguments.length === 1 && firstTypeArg)
      return { element: typeToSchema(firstTypeArg, depth + 1), kind: 'array' }
    if (flags & ts.TypeFlags.Object) {
      const shape: Record<string, { optional: boolean; schema: SchemaNode }> = {}
      const props = type.getProperties().toSorted((a, b) => a.name.localeCompare(b.name))
      for (const prop of props) {
        const decl = prop.valueDeclaration ?? prop.declarations?.[0]
        if (!decl) continue
        const propType = checker.getTypeOfSymbolAtLocation(prop, decl)
        const hasUndef = propType.isUnion() && propType.types.some(t => Boolean(t.flags & ts.TypeFlags.Undefined))
        const optional = (prop.flags & ts.SymbolFlags.Optional) !== 0 || hasUndef
        shape[prop.name] = { optional, schema: typeToSchema(propType, depth + 1) }
      }
      return { kind: 'object', shape }
    }
    return { kind: 'unknown', text: checker.typeToString(type) }
  }
  const out = new Map<string, Extracted>()
  for (const file of toolFiles) {
    const src = program.getSourceFile(file)
    if (!src) continue
    ts.forEachChild(src, node => {
      if (!ts.isVariableStatement(node)) return
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue
        if (!['action', 'mutation', 'query'].includes(decl.name.text)) continue
        if (!(decl.initializer && ts.isCallExpression(decl.initializer))) continue
        const opts = decl.initializer.arguments[0]
        if (!(opts && ts.isObjectLiteralExpression(opts))) continue
        const handlerProp = opts.properties.find(
          p => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'handler'
        )
        if (!(handlerProp && ts.isPropertyAssignment(handlerProp))) continue
        const sigs = checker.getTypeAtLocation(handlerProp.initializer).getCallSignatures()
        const [firstSig] = sigs
        if (!firstSig) continue
        const returnType = checker.getReturnTypeOfSignature(firstSig)
        const awaited = checker.getAwaitedType?.(returnType) ?? returnType
        const params = firstSig.getParameters()
        const argsParam = params[1]
        let argsSchema: null | SchemaNode = null
        if (argsParam?.valueDeclaration) {
          const argsType = checker.getTypeOfSymbolAtLocation(argsParam, argsParam.valueDeclaration)
          argsSchema = typeToSchema(argsType)
        }
        const jsdocs = ts.getJSDocCommentsAndTags(node)
        const jsdocNode = jsdocs.find(d => ts.isJSDoc(d))
        const commentText = jsdocNode?.comment
        const jsdoc = typeof commentText === 'string' ? commentText.trim() : null
        out.set(file, { args: argsSchema, jsdoc, schema: typeToSchema(awaited) })
      }
    })
  }
  return out
}
export { extractSchemas }
export type { Extracted, SchemaNode }

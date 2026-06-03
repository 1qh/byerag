import type { GenericValidator, Validator } from 'convex/values'

interface ArgConstraints {
  /** Allowed values for enum args. Populated by `arg.enum`. */
  enum?: readonly string[]
  /** Reject non-integer numbers. */
  integer?: boolean
  /** Builder that produced this spec. Drives string→typed coercion in `validateArgs`. */
  kind?: 'bool' | 'enum' | 'number' | 'string'
  /** Inclusive numeric max (number args). */
  max?: number
  /** Inclusive length max (string args). */
  maxLength?: number
  /** Inclusive numeric min (number args). */
  min?: number
  /** Inclusive length min (string args). */
  minLength?: number
  /** Regex the raw string must match. */
  pattern?: string
}
interface ArgSpec<
  V extends GenericValidator = GenericValidator,
  Optional extends boolean = boolean,
  Aliases extends readonly string[] = readonly string[]
> extends ArgConstraints {
  aliases?: Aliases
  default?: unknown
  description: string
  optional?: Optional
  required?: boolean
  v: V
}
type ArgSpecs = Record<string, ArgSpec>
type CostClass = 'high' | 'low' | 'medium'
interface DispatchError {
  category: ErrorCategory
  code: string
  details?: Record<string, unknown>
  message: string
  retryable: boolean
}
type ErrorCategory = 'auth' | 'input' | 'permanent' | 'transient' | 'upstream'
interface IntrospectedValidator {
  element?: IntrospectedValidator
  fields?: Record<string, IntrospectedValidator>
  isOptional?: 'optional' | 'required'
  kind: string
  members?: IntrospectedValidator[]
  tableName?: string
  value?: unknown
}
interface ManifestArg {
  aliases?: readonly string[]
  description: string
  enum?: readonly string[]
  integer?: boolean
  max?: number
  maxLength?: number
  min?: number
  minLength?: number
  name: string
  pattern?: string
  required: boolean
  type: string
}
interface ManifestCommand {
  args: ManifestArg[]
  cost: CostClass
  deprecated?: null | { message: string; replacedBy: string }
  description: string
  deterministic: boolean
  errorCodes: readonly string[]
  examples: readonly string[]
  exclusive: readonly (readonly string[])[]
  output: ValidatorJson
  version: string
}
interface ManifestNode {
  children?: Record<string, ManifestNode>
  command?: ManifestCommand
  description?: string
  kind: 'command' | 'group' | 'provider'
}
interface ProviderMeta {
  description: string
  enabled?: boolean
  name: string
  requiresEnv: readonly string[]
}
interface RegistryEntry<Tier extends string = string> {
  argSpecs: ArgSpecs
  fn: unknown
  inferredDescription: null | string
  inferredSchema: null | SchemaNode
  kind: ToolKind
  meta: ToolMeta
  path: readonly string[]
  tier: Tier
}
type SchemaNode =
  | { element: SchemaNode; kind: 'array' }
  | { kind: 'boolean' }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'null' }
  | { kind: 'number' }
  | { kind: 'object'; shape: Record<string, { optional: boolean; schema: SchemaNode }> }
  | { kind: 'string' }
  | { kind: 'union'; members: readonly SchemaNode[] }
  | { kind: 'unknown'; text?: string }
type ToolKind = 'action' | 'mutation' | 'query'
interface ToolMeta {
  cost: CostClass
  deprecated?: null | { message: string; replacedBy: string }
  description: string
  deterministic: boolean
  errorCodes: readonly string[]
  examples: readonly string[]
  exclusive: readonly (readonly string[])[]
  selfTest: Record<string, unknown>
  version: string
}
type ValidatorJson =
  | { element: ValidatorJson; type: 'array' }
  | { enum: readonly string[]; type: 'enum' }
  | { shape: Record<string, ValidatorJson>; type: 'object' }
  | { tableName: string; type: 'id' }
  | { type: 'boolean' }
  | { type: 'number' }
  | { type: 'string' }
  | { type: 'unknown' }
const introspect = (val: Validator<unknown, 'optional' | 'required', string>): IntrospectedValidator => val
export { introspect }
export type {
  ArgConstraints,
  ArgSpec,
  ArgSpecs,
  CostClass,
  DispatchError,
  ErrorCategory,
  IntrospectedValidator,
  ManifestArg,
  ManifestCommand,
  ManifestNode,
  ProviderMeta,
  RegistryEntry,
  SchemaNode,
  ToolKind,
  ToolMeta,
  ValidatorJson
}

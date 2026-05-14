import { config as admin } from '../../../admin/server'
import { config as user } from '../../../user/server'
const APPS = { admin, user } as const
export { APPS }

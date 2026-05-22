import type { AppConfig } from './types'
import { APPS } from './_apps'

type AppId = keyof typeof APPS
const isAppId = (id: string): id is AppId => id in APPS
const resolveApp = (id: string): AppConfig => {
  if (!isAppId(id)) throw new Error(`unknown app id: ${id}`)
  return APPS[id]
}
export { APPS, isAppId, resolveApp }
export type { AppId }

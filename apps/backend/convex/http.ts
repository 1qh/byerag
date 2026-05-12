import { httpRouter } from 'convex/server'
import { APPS } from './apps/_apps'
import { auth } from './auth'
import { anthropicProxy, completeHttp, streamEventHttp } from './messages'
import { deviceInit, devicePoll, tokensRevoke } from './tools/_app/cliAuth'
import { exec as cliExec, manifestHttp as cliManifest } from './tools/_app/dispatch'
import { skillHttp } from './tools/_app/skill'
import { execStreamHttp, streamHttp } from './tools/_app/stream'
const http = httpRouter()
auth.addHttpRoutes(http)
http.route({ handler: cliManifest, method: 'POST', path: '/api/cli/manifest' })
http.route({ handler: cliExec, method: 'POST', path: '/api/cli/exec' })
http.route({ handler: deviceInit, method: 'POST', path: '/api/cli/device/init' })
http.route({ handler: devicePoll, method: 'POST', path: '/api/cli/device/poll' })
http.route({ handler: tokensRevoke, method: 'POST', path: '/api/cli/tokens/revoke' })
http.route({ handler: skillHttp, method: 'GET', path: '/api/cli/skill' })
http.route({ handler: streamHttp, method: 'POST', path: '/api/cli/stream' })
http.route({ handler: execStreamHttp, method: 'POST', path: '/api/cli/exec-stream' })
http.route({ handler: streamEventHttp, method: 'POST', path: '/api/stream/event' })
http.route({ handler: completeHttp, method: 'POST', path: '/api/stream/complete' })
http.route({ handler: anthropicProxy, method: 'POST', pathPrefix: '/api/anthropic/' })
for (const app of Object.values(APPS))
  for (const route of app.httpRoutes ?? []) http.route({ handler: route.handler, method: route.method, path: route.path })
export default http

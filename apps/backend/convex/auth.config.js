/* oxlint-disable import/no-anonymous-default-export */
/** biome-ignore-all lint/style/noProcessEnv: Convex Auth required format */
export default {
  providers: [
    {
      applicationID: 'convex',
      domain: process.env.CONVEX_SITE_URL
    }
  ]
}

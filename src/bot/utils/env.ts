const { env } = process
export const httpProxyEnv = Object.fromEntries(
  Object.entries({
    http_proxy: env.HTTP_PROXY || env.http_proxy || '',
    https_proxy: env.HTTPS_PROXY || env.https_proxy || '',
    no_proxy: env.NO_PROXY || env.no_proxy || '',
  }).filter(([_k, v]) => !!v),
)

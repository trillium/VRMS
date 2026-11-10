// Base URL the in-process cron workers use to call this app's own /api routes.
//
// WORKER_API_BASE_URL wins when set. This is what lets a deployment that is not
// the Hack for LA production site (a preview, a staging box, a proof of concept)
// keep its workers from calling https://www.vrms.io. When it is unset the
// behaviour is unchanged: the public site in prod, localhost everywhere else.
export const DEFAULT_PROD_API_BASE_URL = 'https://www.vrms.io';

export function getWorkerApiBaseUrl(env = process.env) {
  const override = env.WORKER_API_BASE_URL?.trim();
  if (override) return override.replace(/\/+$/, '');
  return env.NODE_ENV === 'prod'
    ? DEFAULT_PROD_API_BASE_URL
    : `http://localhost:${env.BACKEND_PORT}`;
}

import { purgeExpiredSessions, stravaStore } from '../lib/strava';

export default async () => {
  await purgeExpiredSessions(stravaStore());
  return new Response(null, { status: 204 });
};

export const config = { schedule: '@daily' };

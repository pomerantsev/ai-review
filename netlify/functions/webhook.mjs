import { handle } from '../../app/src/core.js';
export async function handler(event) {
  const result = await handle({ headers: event.headers || {}, body: event.body || '' });
  return { statusCode: result.status, body: result.body };
}

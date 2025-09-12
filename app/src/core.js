import crypto from 'node:crypto';
import { App } from '@octokit/app';

const REQUIRED_PERMS = new Set(['admin', 'maintain', 'write']);

function getHeader(headers, name) {
  // headers may be lowercase (Netlify) or mixed case (Express)
  const key = Object.keys(headers).find((h) => h.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

export async function handle({ headers, body }) {
  const secret = (process.env.GITHUB_WEBHOOK_SECRET || '').trim();
  console.log(secret);
  if (!secret) return { status: 500, body: 'missing secret' };

  const sig = getHeader(headers, 'x-hub-signature-256');
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (!sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { status: 401, body: 'bad signature' };
  }

  const event = getHeader(headers, 'x-github-event');
  const payload = JSON.parse(body);

  if (event !== 'issue_comment' || payload.action !== 'created')
    return { status: 200, body: 'ignored' };
  if (!payload.issue?.pull_request) return { status: 200, body: 'ignored (not PR)' };

  const text = (payload.comment?.body || '').trim().toLowerCase();
  if (!text.startsWith('@pomerantsev-ai review')) return { status: 200, body: 'ignored (no cmd)' };
  if (payload.comment?.user?.type === 'Bot') return { status: 200, body: 'ignored (bot)' };

  const appId = process.env.APP_ID;
  let privateKey = process.env.PRIVATE_KEY; // PEM string
  console.log('Private key:', !!privateKey);
  if (!privateKey && process.env.PRIVATE_KEY_BASE64) {
    privateKey = Buffer.from(process.env.PRIVATE_KEY_BASE64, 'base64').toString('utf8');
    console.log('Private key (from base64):', !!privateKey);
  }
  if (!appId || !privateKey) return { status: 500, body: 'missing app creds' };

  const app = new App({ appId, privateKey });
  const octokit = await app.getInstallationOctokit(payload.installation.id);

  // permission check
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const username = payload.comment.user.login;
  const perm = await octokit.request(
    'GET /repos/{owner}/{repo}/collaborators/{username}/permission',
    { owner, repo, username },
  );
  if (!REQUIRED_PERMS.has(perm.data.permission)) {
    return { status: 200, body: 'ignored (insufficient perms)' };
  }

  const { data: pr } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner,
    repo,
    pull_number: payload.issue.number,
    headers: { 'X-GitHub-Api-Version': '2022-11-28' },
  });

  const headSha = pr.head?.sha || 'unknown';
  
  // Add eyes emoji reaction to the triggering comment
  await octokit.request('POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions', {
    owner,
    repo,
    comment_id: payload.comment.id,
    content: 'eyes',
    headers: { 'X-GitHub-Api-Version': '2022-11-28' },
  });

  const deliveryId = getHeader(headers, 'x-github-delivery');
  let dispatchStatus = 'success';
  try {
    await octokit.request('POST /repos/{owner}/{repo}/dispatches', {
      owner,
      repo,
      event_type: 'ai.review',
      client_payload: {
        owner,
        repo,
        pr_number: payload.issue.number,
        head_sha: headSha,
        requested_by: username,
      },
      headers: { 'X-GitHub-Api-Version': '2022-11-28' },
    });
  } catch (err) {
    dispatchStatus = 'failure';
    console.error('Dispatch error:', err);
  }
  console.log(
    JSON.stringify({
      delivery_id: deliveryId,
      repo,
      pr_number: payload.issue.number,
      dispatch_status: dispatchStatus,
    }),
  );

  return { status: 200, body: 'ok' };
}

import * as core from '@actions/core';
import * as github from '@actions/github';

const payload = github.context.payload;
const prNumber = payload.client_payload?.pr_number;
const headSha = payload.client_payload?.head_sha;

core.info(`Received PR #${prNumber} with head_sha ${headSha}`);

const token = process.env.GITHUB_TOKEN;
const octokit = github.getOctokit(token);

if (prNumber && payload.repository) {
  // Fetch PR metadata
  const { data: pr } = await octokit.rest.pulls.get({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    pull_number: prNumber,
  });

  // Fetch changed files (first 100 for now)
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    pull_number: prNumber,
    per_page: 100,
  });

  // Prepare info
  const fileList = files.map((f) => f.filename).join('\n');
  const commentBody = [
    `👋 AI review placeholder for \`${headSha}\`!`,
    `**PR Title:** ${pr.title}`,
    `**Author:** ${pr.user.login}`,
    `**Files changed:**\n${fileList}`,
    '<!-- ai-review:sha=' + headSha + ' -->',
  ].join('\n\n');

  await octokit.rest.issues.createComment({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    issue_number: prNumber,
    body: commentBody,
  });
  core.info('Posted PR metadata and file list.');
} else {
  core.setFailed('Missing pr_number or repository in payload.');
}

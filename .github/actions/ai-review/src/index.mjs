import * as core from '@actions/core';
import * as github from '@actions/github';

const payload = github.context.payload;
const prNumber = payload.client_payload?.pr_number;
const headSha = payload.client_payload?.head_sha;

core.info(`Received PR #${prNumber} with head_sha ${headSha}`);

const token = process.env.GITHUB_TOKEN;
const octokit = github.getOctokit(token);

if (prNumber && payload.repository) {
  await octokit.rest.issues.createComment({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    issue_number: prNumber,
    body: `👋 AI review placeholder for \`${headSha}\`!`,
  });
  core.info('Posted placeholder comment.');
} else {
  core.setFailed('Missing pr_number or repository in payload.');
}

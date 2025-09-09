import * as core from '@actions/core';
import * as github from '@actions/github';
import Anthropic from '@anthropic-ai/sdk';

const payload = github.context.payload;
const prNumber = payload.client_payload?.pr_number;
const headSha = payload.client_payload?.head_sha;

core.info(`Received PR #${prNumber} with head_sha ${headSha}`);

const token = process.env.GITHUB_TOKEN;
const octokit = github.getOctokit(token);
const llmApiKey = process.env.LLM_API_KEY;

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
    per_page: 5,
  });

  const fileSummaries = [];
  for (const file of files) {
    if (file.patch && file.patch.length < 5000) {
      fileSummaries.push(`### ${file.filename}\n\`\`\`diff\n${file.patch}\n\`\`\``);
    }
  }

  // Prepare prompt for Claude
  const prompt = [
    `You are an expert code reviewer. Please review the following PR:`,
    `**Title:** ${pr.title}`,
    `**Author:** ${pr.user.login}`,
    `**Description:**\n${pr.body || '(no description)'}\n`,
    `**Changed files:**\n${fileSummaries.join('\n\n')}`,
    `Please provide a summary, risks, and suggestions.`,
  ].join('\n\n');

  core.info(`Prepared prompt for Claude: ${prompt}`);

  const anthropic = new Anthropic({ apiKey: llmApiKey });

  let aiReview;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', // or your preferred model
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    aiReview = message.content?.[0]?.text || 'No response from Claude.';
  } catch (err) {
    core.setFailed(`Claude SDK error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Post the AI review as a comment
  const commentBody = [
    `🤖 **AI Review for \`${headSha}\`**`,
    aiReview,
    '<!-- ai-review:sha=' + headSha + ' -->',
  ].join('\n\n');

  await octokit.rest.issues.createComment({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    issue_number: prNumber,
    body: commentBody,
  });
  core.info('Posted AI review comment.');
} else {
  core.setFailed('Missing pr_number or repository in payload.');
}

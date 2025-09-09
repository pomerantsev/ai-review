
# AI Reviewer (App + Action)
This is an experimental **GitHub App + GitHub Action combo** that responds to
`@pomerantsev-ai review` comments on pull requests by running an AI-assisted code review
workflow.

⚠️ **Note:** This project is mostly *vibe-coded* with the help of ChatGPT.
It’s a learning playground to understand GitHub App and GitHub Action concepts,
not a polished or production-ready tool.

AI Reviewer is a two-part system for automated, LLM-powered code review on GitHub pull requests:

- **GitHub App** ("AI Review Dev" for development, "Pavel's AI Review" for production):
  - Listens for PR comments: `@pomerantsev-ai review`
  - Verifies permissions and posts an ACK comment
  - Dispatches a job to the Action for the actual review
- **GitHub Action**:
  - Runs in the host repo via a workflow
  - Gathers PR context (title, body, changed files, etc.)
  - Calls an LLM (Claude) to generate a review
  - Posts the review as a PR comment

---

## How to Enable AI Reviewer in Your Repo (Dev or Prod)

### 1. **Install the GitHub App**

- **Dev mode:** [Install "AI Review Dev" App](https://github.com/apps/ai-review-dev)
- **Prod mode:** [Install "Pavel's AI Review" App](https://github.com/apps/pavel-s-ai-review)

Install the app on your target repository (or organization) and grant the required permissions (contents: write, issues: write, pull requests: write, metadata: read).

### 2. **Add the Workflow and Action to Your Repo**

Copy the following workflow file to `.github/workflows/ai-review.yml` in your repo:

```yaml
name: AI Review
on:
  repository_dispatch:
    types: [ai.review]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
      - uses: pomerantsev/ai-review/.github/actions/ai-review@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
```

> **Note:** You can use the `main` branch or pin to a specific commit for stability.

### 3. **Add the LLM API Key Secret**

- Go to your repo’s **Settings > Secrets and variables > Actions**
- Add a new repository secret named `LLM_API_KEY` with your Claude API key

### 4. **(Optional) Use Dev or Prod Mode**

- To use the dev app, install "AI Review Dev" and run `npm run dev:app` locally (you'll need to set up your dev environment; see [Dev Environment Setup](#dev-environment-setup)).
- To use the prod app, install "Pavel's AI Review"


You can have both apps installed on different repos.

---

## How to Trigger an AI Review

1. **Open a pull request** in your repo
2. **Comment** on the PR with `@pomerantsev-ai review` (or the bot’s configured mention)
3. The App will:
   - Verify your permissions
   - Post an ACK comment
   - Dispatch a job to the Action
4. The Action will:
   - Gather PR context and changed files
   - Call Claude to generate a review
   - Post the review as a PR comment (with a hidden marker for idempotency)

---

## What Happens Under the Hood?

1. **App**: Listens for PR comments, checks permissions, posts ACK, and dispatches a `repository_dispatch` event with PR info
2. **Action**: Runs in the host repo, gathers PR context, calls Claude, and posts a review comment

---

## FAQ

**Q: Can I use this in both dev and prod?**
A: Yes! Use the dev app and dev Claude key for testing, and the prod app/key for production.

**Q: What permissions are required?**
A: The App needs contents: write, issues: write, pull requests: write, metadata: read. The Action uses the default `GITHUB_TOKEN` and your `LLM_API_KEY` secret.

**Q: How do I update the review logic?**
A: All logic lives in the central action repo. Just update the action code and push to `main` (or your pinned commit).


**Q: How do I trigger a review?**
A: Comment `@pomerantsev-ai review` on any open PR.

---

## Dev Environment Setup

To run the app locally for development or testing:

1. **Install dependencies:**
  ```sh
  npm install
  ```

2. **Create a `.env` file in the `app/` directory:**
  ```env
  GITHUB_APP_ID=1885424
  GITHUB_WEBHOOK_SECRET=<app's webhook secret>
  GITHUB_PRIVATE_KEY_PATH=secrets/private-key.pem # The file must contain the app's private key
  PORT=3000
  # Optionally, for local testing:
  LLM_API_KEY=your_claude_api_key
  ```

3. **Start the app in dev mode:**
  ```sh
  npm run dev:app
  ```

4. **Use ngrok to expose your local server for GitHub webhook delivery.**
  ```sh
  ngrok http 3000
  ```

  Paste the URL that ngrok provides into the dev app's "Webhook URL" input.

**Action development**

Testing the action code locally is not straightforward, and I just pushed it, and it worked.
If need be, it may be possible to develop the action locally using act (https://github.com/nektos/act).

# AI Reviewer (App + Action)

This is an experimental **GitHub App + GitHub Action combo** that responds to
`@ai review` comments on pull requests by running an AI-assisted code review
workflow.

- **GitHub App**: Listens for PR comments, checks permissions, and dispatches jobs.
- **GitHub Action**: Runs on a workflow runner, gathers context from the PR, and
  posts a review comment generated with an LLM.

---

⚠️ **Note:** This project is mostly *vibe-coded* with the help of ChatGPT.
It’s a learning playground to understand GitHub App and GitHub Action concepts,
not a polished or production-ready tool.

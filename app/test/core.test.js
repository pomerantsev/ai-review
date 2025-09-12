import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { handle } from '../src/core.js';

// Mock environment variables
const originalEnv = process.env;

describe('AI Review Bot Core Handler', () => {
  before(() => {
    // Set up test environment variables
    process.env = {
      ...originalEnv,
      GITHUB_WEBHOOK_SECRET: 'test-secret',
      APP_ID: 'test-app-id',
      PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\ntest-key\n-----END RSA PRIVATE KEY-----',
    };
  });

  after(() => {
    process.env = originalEnv;
  });

  describe('Webhook signature validation', () => {
    it('should reject requests with invalid signatures', async () => {
      const body = JSON.stringify({ test: 'data' });
      const headers = {
        'x-hub-signature-256': 'invalid-signature',
        'x-github-event': 'issue_comment',
      };

      const result = await handle({ headers, body });
      assert.equal(result.status, 401);
      assert.equal(result.body, 'bad signature');
    });

    it('should reject requests without signatures', async () => {
      const body = JSON.stringify({ test: 'data' });
      const headers = {
        'x-github-event': 'issue_comment',
      };

      const result = await handle({ headers, body });
      assert.equal(result.status, 401);
      assert.equal(result.body, 'bad signature');
    });
  });

  describe('Event filtering', () => {
    function createValidSignature(body) {
      const secret = 'test-secret';
      return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    }

    it('should ignore non-issue_comment events', async () => {
      const body = JSON.stringify({ action: 'created' });
      const headers = {
        'x-hub-signature-256': createValidSignature(body),
        'x-github-event': 'push',
      };

      const result = await handle({ headers, body });
      assert.equal(result.status, 200);
      assert.equal(result.body, 'ignored');
    });

    it('should ignore issue_comment events that are not created', async () => {
      const body = JSON.stringify({ action: 'edited' });
      const headers = {
        'x-hub-signature-256': createValidSignature(body),
        'x-github-event': 'issue_comment',
      };

      const result = await handle({ headers, body });
      assert.equal(result.status, 200);
      assert.equal(result.body, 'ignored');
    });

    it('should ignore comments on issues (not PRs)', async () => {
      const payload = {
        action: 'created',
        issue: { number: 1 }, // No pull_request field
        comment: { body: '@pomerantsev-ai review', user: { type: 'User' } },
      };
      const body = JSON.stringify(payload);
      const headers = {
        'x-hub-signature-256': createValidSignature(body),
        'x-github-event': 'issue_comment',
      };

      const result = await handle({ headers, body });
      assert.equal(result.status, 200);
      assert.equal(result.body, 'ignored (not PR)');
    });

    it('should ignore comments without the trigger phrase', async () => {
      const payload = {
        action: 'created',
        issue: { number: 1, pull_request: {} },
        comment: { body: 'Just a regular comment', user: { type: 'User' } },
      };
      const body = JSON.stringify(payload);
      const headers = {
        'x-hub-signature-256': createValidSignature(body),
        'x-github-event': 'issue_comment',
      };

      const result = await handle({ headers, body });
      assert.equal(result.status, 200);
      assert.equal(result.body, 'ignored (no cmd)');
    });

    it('should ignore comments from bots', async () => {
      const payload = {
        action: 'created',
        issue: { number: 1, pull_request: {} },
        comment: { body: '@pomerantsev-ai review', user: { type: 'Bot' } },
      };
      const body = JSON.stringify(payload);
      const headers = {
        'x-hub-signature-256': createValidSignature(body),
        'x-github-event': 'issue_comment',
      };

      const result = await handle({ headers, body });
      assert.equal(result.status, 200);
      assert.equal(result.body, 'ignored (bot)');
    });
  });

  describe('Eyes emoji reaction behavior', () => {
    function createValidPayload() {
      return {
        action: 'created',
        issue: { number: 42, pull_request: {} },
        comment: {
          id: 123456,
          body: '@pomerantsev-ai review',
          user: { login: 'testuser', type: 'User' },
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
        },
        installation: { id: 789 },
      };
    }

    function createValidRequest(payload) {
      const body = JSON.stringify(payload);
      const secret = 'test-secret';
      const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
      return {
        body,
        headers: {
          'x-hub-signature-256': signature,
          'x-github-event': 'issue_comment',
          'x-github-delivery': 'test-delivery-id',
        },
      };
    }

    it('should add eyes emoji reaction to the triggering comment', async () => {
      const payload = createValidPayload();
      const request = createValidRequest(payload);

      // Track API calls
      const apiCalls = [];

      // Mock the Octokit App module
      const mockOctokit = {
        request: mock.fn(async (endpoint, params) => {
          apiCalls.push({ endpoint, params });
          
          if (endpoint.includes('/collaborators/') && endpoint.includes('/permission')) {
            return { data: { permission: 'write' } };
          }
          if (endpoint.includes('/pulls/')) {
            return { data: { head: { sha: 'abc123' } } };
          }
          if (endpoint.includes('/reactions')) {
            // This is the key behavior we're testing
            return { data: { id: 1, content: 'eyes' } };
          }
          if (endpoint.includes('/dispatches')) {
            return { data: {} };
          }
          throw new Error(`Unexpected endpoint: ${endpoint}`);
        }),
      };

      // Mock @octokit/app module
      const originalModule = await import('@octokit/app');
      const MockApp = class {
        constructor() {}
        async getInstallationOctokit() {
          return mockOctokit;
        }
      };

      // Replace the App class
      originalModule.App = MockApp;

      const result = await handle(request);

      // Verify the reaction was added
      const reactionCall = apiCalls.find(call => call.endpoint.includes('/reactions'));
      assert.ok(reactionCall, 'Should have called the reactions endpoint');
      assert.equal(reactionCall.params.comment_id, 123456, 'Should use correct comment ID');
      assert.equal(reactionCall.params.content, 'eyes', 'Should add eyes emoji');
      assert.equal(reactionCall.params.owner, 'test-owner', 'Should use correct owner');
      assert.equal(reactionCall.params.repo, 'test-repo', 'Should use correct repo');

      // Verify no comment was created (the old behavior)
      const commentCall = apiCalls.find(call => call.endpoint.includes('/comments') && !call.endpoint.includes('/reactions'));
      assert.ok(!commentCall, 'Should NOT create a comment (old behavior)');

      assert.equal(result.status, 200);
      assert.equal(result.body, 'ok');
    });

    it('should still dispatch workflow after adding reaction', async () => {
      const payload = createValidPayload();
      const request = createValidRequest(payload);

      const apiCalls = [];
      const mockOctokit = {
        request: mock.fn(async (endpoint, params) => {
          apiCalls.push({ endpoint, params });
          
          if (endpoint.includes('/collaborators/') && endpoint.includes('/permission')) {
            return { data: { permission: 'admin' } };
          }
          if (endpoint.includes('/pulls/')) {
            return { data: { head: { sha: 'def456' } } };
          }
          if (endpoint.includes('/reactions')) {
            return { data: { id: 2, content: 'eyes' } };
          }
          if (endpoint.includes('/dispatches')) {
            return { data: {} };
          }
          throw new Error(`Unexpected endpoint: ${endpoint}`);
        }),
      };

      const originalModule = await import('@octokit/app');
      originalModule.App = class {
        constructor() {}
        async getInstallationOctokit() {
          return mockOctokit;
        }
      };

      const result = await handle(request);

      // Verify both reaction and dispatch were called
      const reactionCall = apiCalls.find(call => call.endpoint.includes('/reactions'));
      const dispatchCall = apiCalls.find(call => call.endpoint.includes('/dispatches'));
      
      assert.ok(reactionCall, 'Should have added reaction');
      assert.ok(dispatchCall, 'Should have dispatched workflow');
      
      // Verify dispatch payload
      assert.equal(dispatchCall.params.event_type, 'ai.review');
      assert.equal(dispatchCall.params.client_payload.pr_number, 42);
      assert.equal(dispatchCall.params.client_payload.head_sha, 'def456');
      assert.equal(dispatchCall.params.client_payload.requested_by, 'testuser');

      assert.equal(result.status, 200);
      assert.equal(result.body, 'ok');
    });

    it('should handle reaction API failures gracefully', async () => {
      const payload = createValidPayload();
      const request = createValidRequest(payload);

      const mockOctokit = {
        request: mock.fn(async (endpoint) => {
          if (endpoint.includes('/collaborators/') && endpoint.includes('/permission')) {
            return { data: { permission: 'write' } };
          }
          if (endpoint.includes('/pulls/')) {
            return { data: { head: { sha: 'ghi789' } } };
          }
          if (endpoint.includes('/reactions')) {
            // Simulate API failure
            throw new Error('GitHub API error: rate limit exceeded');
          }
          if (endpoint.includes('/dispatches')) {
            return { data: {} };
          }
          throw new Error(`Unexpected endpoint: ${endpoint}`);
        }),
      };

      const originalModule = await import('@octokit/app');
      originalModule.App = class {
        constructor() {}
        async getInstallationOctokit() {
          return mockOctokit;
        }
      };

      // Even if reaction fails, the handler should not crash
      // This is a potential improvement area - currently the code doesn't handle reaction failures
      await assert.rejects(
        async () => await handle(request),
        /GitHub API error/,
        'Should propagate reaction API errors (current behavior)'
      );
    });

    it('should check user permissions before adding reaction', async () => {
      const payload = createValidPayload();
      const request = createValidRequest(payload);

      const apiCalls = [];
      const mockOctokit = {
        request: mock.fn(async (endpoint, params) => {
          apiCalls.push({ endpoint, params });
          
          if (endpoint.includes('/collaborators/') && endpoint.includes('/permission')) {
            // User has read-only permission
            return { data: { permission: 'read' } };
          }
          throw new Error(`Unexpected endpoint: ${endpoint}`);
        }),
      };

      const originalModule = await import('@octokit/app');
      originalModule.App = class {
        constructor() {}
        async getInstallationOctokit() {
          return mockOctokit;
        }
      };

      const result = await handle(request);

      // Verify permission was checked
      const permCheck = apiCalls.find(call => call.endpoint.includes('/permission'));
      assert.ok(permCheck, 'Should check user permissions');

      // Verify no reaction was added due to insufficient permissions
      const reactionCall = apiCalls.find(call => call.endpoint.includes('/reactions'));
      assert.ok(!reactionCall, 'Should NOT add reaction for users without write access');

      assert.equal(result.status, 200);
      assert.equal(result.body, 'ignored (insufficient perms)');
    });
  });
});
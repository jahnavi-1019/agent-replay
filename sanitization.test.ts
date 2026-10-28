import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePayload, sanitizeString } from './redactor.js';

test('AgentReplay Sanitization: redacts OpenAI and Anthropic API keys', () => {
  const input = 'Here is my key: sk-abcdefghijklmnopqrstuvwxyz123456789 and anthropic: sk-ant-api03-abcdefghijklmnop123456789';
  const cleaned = sanitizeString(input);

  assert.ok(!cleaned.includes('sk-abcdef'), 'OpenAI key must be scrubbed');
  assert.ok(!cleaned.includes('sk-ant-api03'), 'Anthropic key must be scrubbed');
  assert.ok(cleaned.includes('[REDACTED_OPENAI_KEY]'), 'Must insert redaction token');
  assert.ok(cleaned.includes('[REDACTED_ANTHROPIC_KEY]'), 'Must insert redaction token');
});

test('AgentReplay Sanitization: redacts Bearer tokens, emails, and credit cards in deep objects', () => {
  const dirtyPayload = {
    headers: {
      Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.supersecret',
      'user-agent': 'AgentRunner/1.0',
    },
    user: {
      email: 'jane.doe@internal-enterprise.com',
      ssn: '123-45-6789',
      creditCard: '4111 2222 3333 4444',
      password: 'SuperSecretMasterPassword123!',
    },
    toolCalls: [
      {
        name: 'refund_customer',
        arguments: {
          account_email: 'customer.support@target.org',
          amount: 49.99,
          api_key: 'sk-99887766554433221100',
        },
      },
    ],
  };

  const clean = sanitizePayload(dirtyPayload);

  // Assert credentials scrubbed
  assert.equal(clean.headers.Authorization, 'Bearer [REDACTED_BEARER_TOKEN]');
  assert.equal(clean.user.email, '[REDACTED_EMAIL]');
  assert.equal(clean.user.ssn, '[REDACTED_SSN]');
  assert.equal(clean.user.creditCard, '[REDACTED_CREDIT_CARD]');
  assert.equal(clean.user.password, '[REDACTED_SENSITIVE_FIELD]');

  // Assert nested tool call scrubbed
  assert.equal(clean.toolCalls[0].arguments.account_email, '[REDACTED_EMAIL]');
  assert.equal(clean.toolCalls[0].arguments.amount, 49.99, 'Non-sensitive data preserved');
  assert.equal(clean.toolCalls[0].arguments.api_key, '[REDACTED_SENSITIVE_FIELD]');
});

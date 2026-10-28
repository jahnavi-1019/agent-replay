/**
 * PII and Secret Sanitization Engine for AgentReplay
 */

const SECRET_PATTERNS = [
  // Anthropic Keys (Must come before generic sk- OpenAI)
  { regex: /sk-ant-[a-zA-Z0-9_-]{15,}/g, replacement: '[REDACTED_ANTHROPIC_KEY]' },
  // OpenAI Keys
  { regex: /sk-(?!ant-)[a-zA-Z0-9_-]{15,}/g, replacement: '[REDACTED_OPENAI_KEY]' },
  // Bearer Tokens
  { regex: /Bearer\s+[a-zA-Z0-9_\-\.]{10,}/gi, replacement: 'Bearer [REDACTED_BEARER_TOKEN]' },
  // Credit Card Numbers
  { regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[REDACTED_CREDIT_CARD]' },
  // Emails
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[REDACTED_EMAIL]' },
  // SSN
  { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]' },
];

const SENSITIVE_KEY_NAMES = new Set([
  'password',
  'passwd',
  'secret',
  'api_key',
  'apikey',
  'access_token',
  'auth_token',
  'private_key',
]);

/**
 * Sanitize a string against credential & PII regular expressions
 */
export function sanitizeString(val: string): string {
  let cleaned = val;
  for (const { regex, replacement } of SECRET_PATTERNS) {
    cleaned = cleaned.replace(regex, replacement);
  }
  return cleaned;
}

/**
 * Recursively walk any JSON-serializable structure and scrub credentials and PII
 */
export function sanitizePayload<T = any>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeString(data) as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePayload(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const sanitizedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEY_NAMES.has(lowerKey)) {
        sanitizedObj[key] = '[REDACTED_SENSITIVE_FIELD]';
      } else {
        sanitizedObj[key] = sanitizePayload(value);
      }
    }
    return sanitizedObj as T;
  }

  return data;
}

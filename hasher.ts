import * as crypto from 'node:crypto';

/**
 * Deterministic JSON stringify with sorted object keys
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Compute SHA-256 hash of any canonical object
 */
export function computeHash(data: any): string {
  const canonical = canonicalJsonStringify(data);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Compute state hash for a specific execution step
 */
export function computeStepStateHash(stepIndex: number, action: string, message: any, toolCalls?: any): string {
  return computeHash({
    stepIndex,
    action,
    message,
    toolCalls: toolCalls || [],
  });
}

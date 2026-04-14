import { describe, it, expect } from 'vitest';
import { resolveImageUrl } from './RichTextEditor';

/**
 * **Validates: Requirements 2.5, 2.6, 2.11**
 *
 * Tests for the image URL resolution logic in uploadImageFile.
 * The function must handle:
 *   - Relative URLs with leading slash
 *   - Relative URLs without leading slash
 *   - Already-absolute URLs (https:// and http://)
 *   - API base URLs with and without trailing slash
 */
describe('resolveImageUrl', () => {
  const API_URL = 'http://localhost:8787';

  it('resolves a relative URL with leading slash', () => {
    const result = resolveImageUrl('/api/images/abc.png', API_URL);
    expect(result).toBe('http://localhost:8787/api/images/abc.png');
  });

  it('resolves a relative URL without leading slash (the missing-slash bug)', () => {
    const result = resolveImageUrl('api/images/abc.png', API_URL);
    expect(result).toBe('http://localhost:8787/api/images/abc.png');
  });

  it('passes through an already-absolute https URL unchanged', () => {
    const result = resolveImageUrl('https://cdn.example.com/image.png', API_URL);
    expect(result).toBe('https://cdn.example.com/image.png');
  });

  it('passes through an already-absolute http URL unchanged', () => {
    const result = resolveImageUrl('http://other.com/image.png', API_URL);
    expect(result).toBe('http://other.com/image.png');
  });

  it('handles API base URL with trailing slash and relative URL with leading slash', () => {
    const result = resolveImageUrl('/api/images/abc.png', 'http://localhost:8787/');
    expect(result).toBe('http://localhost:8787/api/images/abc.png');
  });

  it('handles API base URL with trailing slash and relative URL without leading slash', () => {
    const result = resolveImageUrl('api/images/abc.png', 'http://localhost:8787/');
    expect(result).toBe('http://localhost:8787/api/images/abc.png');
  });
});

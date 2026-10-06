import { describe, expect, it } from 'vitest';
import { isResourceLoadError } from '@/components/RouteError';

describe('route loading errors', () => {
  it('recognizes failed stylesheet and JavaScript downloads', () => {
    expect(isResourceLoadError(new Error('Unable to preload CSS for https://example.com/file.css'))).toBe(true);
    expect(isResourceLoadError(new TypeError('Failed to fetch dynamically imported module: x.js'))).toBe(true);
  });
  it('does not mislabel application exceptions as network failures', () => {
    expect(isResourceLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isResourceLoadError(null)).toBe(false);
  });
});

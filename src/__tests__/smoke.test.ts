import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('has indexedDB available via fake-indexeddb', () => {
    expect(typeof indexedDB).toBe('object');
    expect(indexedDB).toBeTruthy();
  });
});

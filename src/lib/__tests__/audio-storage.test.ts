import { beforeEach, describe, expect, it } from 'vitest';
import { deleteBlob, getBlob, listBlobIds, putBlob, _resetDbForTests } from '../audio-storage';

describe('audio-storage', () => {
  beforeEach(async () => {
    await _resetDbForTests();
  });

  it('round-trips a blob', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const blob = new Blob([data], { type: 'audio/mpeg' });
    await putBlob('id-1', blob);
    const out = await getBlob('id-1');
    expect(out).not.toBeNull();
    expect(out!.size).toBe(4);
    expect(out!.type).toBe('audio/mpeg');
    const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(out!);
    });
    const roundTripped = new Uint8Array(buf);
    expect(Array.from(roundTripped)).toEqual([1, 2, 3, 4]);
  });

  it('returns null for a missing id', async () => {
    const out = await getBlob('does-not-exist');
    expect(out).toBeNull();
  });

  it('deleteBlob removes the entry', async () => {
    await putBlob('id-2', new Blob([new Uint8Array([9])]));
    await deleteBlob('id-2');
    const out = await getBlob('id-2');
    expect(out).toBeNull();
  });

  it('listBlobIds returns all current ids', async () => {
    await putBlob('a', new Blob(['x']));
    await putBlob('b', new Blob(['y']));
    const ids = await listBlobIds();
    expect(ids.sort()).toEqual(['a', 'b']);
  });
});

import { describe, expect, it } from 'vitest';
import { parseChordGrid, songToChordGrid } from '../song-parser';

describe('song-parser audio headers', () => {
  it('parses Audio URL header', () => {
    const text = [
      'Title: Demo',
      'BPM: 100',
      'Audio: https://example.com/song.mp3',
      '',
      '[A]',
      'G D',
    ].join('\n');
    const { song, errors } = parseChordGrid(text);
    expect(errors).toEqual([]);
    expect(song?.audio).toEqual({
      source: { kind: 'url', url: 'https://example.com/song.mp3' },
      offsetSec: 0,
      mode: 'playalong',
    });
  });

  it('parses AudioOffset and AudioMode', () => {
    const text = [
      'Title: Demo',
      'BPM: 100',
      'Audio: https://example.com/song.mp3',
      'AudioOffset: 3.42',
      'AudioMode: teacher',
      '',
      '[A]',
      'G D',
    ].join('\n');
    const { song } = parseChordGrid(text);
    expect(song?.audio?.offsetSec).toBeCloseTo(3.42, 2);
    expect(song?.audio?.mode).toBe('teacher');
  });

  it('ignores AudioOffset/AudioMode when Audio is absent', () => {
    const text = [
      'Title: Demo',
      'BPM: 100',
      'AudioOffset: 3.42',
      'AudioMode: teacher',
      '',
      '[A]',
      'G D',
    ].join('\n');
    const { song } = parseChordGrid(text);
    expect(song?.audio).toBeUndefined();
  });

  it('falls back to playalong for an unknown AudioMode', () => {
    const text = [
      'Title: Demo',
      'BPM: 100',
      'Audio: https://example.com/song.mp3',
      'AudioMode: frobozz',
      '',
      '[A]',
      'G D',
    ].join('\n');
    const { song } = parseChordGrid(text);
    expect(song?.audio?.mode).toBe('playalong');
  });
});

describe('songToChordGrid audio headers', () => {
  it('emits Audio/AudioOffset/AudioMode for URL sources', () => {
    const text = [
      'Title: Demo',
      'BPM: 100',
      'Audio: https://example.com/song.mp3',
      'AudioOffset: 3.42',
      'AudioMode: backing',
      '',
      '[A]',
      'G D',
    ].join('\n');
    const { song } = parseChordGrid(text);
    const out = songToChordGrid(song!);
    expect(out).toContain('Audio: https://example.com/song.mp3');
    expect(out).toContain('AudioOffset: 3.42');
    expect(out).toContain('AudioMode: backing');
  });

  it('round-trips URL audio through parse/serialize/parse', () => {
    const text = [
      'Title: Demo',
      'BPM: 100',
      'Audio: https://example.com/song.mp3',
      'AudioOffset: 1.25',
      'AudioMode: teacher',
      '',
      '[A]',
      'G D',
    ].join('\n');
    const first = parseChordGrid(text).song!;
    const serialized = songToChordGrid(first);
    const second = parseChordGrid(serialized).song!;
    expect(second.audio).toEqual(first.audio);
  });

  it('omits Audio for blob sources', () => {
    const song = parseChordGrid(['Title: Demo', 'BPM: 100', '', '[A]', 'G D'].join('\n')).song!;
    const withBlob = {
      ...song,
      audio: {
        source: { kind: 'blob' as const, blobId: 'abc' },
        offsetSec: 0,
        mode: 'playalong' as const,
      },
    };
    const out = songToChordGrid(withBlob);
    expect(out).not.toContain('Audio:');
    expect(out).not.toContain('AudioOffset');
    expect(out).not.toContain('AudioMode');
  });
});

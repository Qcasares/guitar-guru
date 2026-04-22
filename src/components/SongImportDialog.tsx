import { useEffect, useMemo, useState } from 'react';
import type { Song } from '../music/types';
import { parseChordGrid, songToChordGrid } from '../music/song-parser';
import { SONG_LIBRARY } from '../music/song-library';

interface SongImportDialogProps {
  currentSong: Song;
  onApply: (song: Song) => void;
  onReset: () => void;
  onClose: () => void;
}

type Tab = 'library' | 'edit';

const PLACEHOLDER = `Title: My Practice Song
Artist: Me
BPM: 90
Time: 4/4

[Verse]
Am  C  D  Em
> Line one  | line two  | line three  | line four

[Chorus]
G  D  Em  C
`;

export function SongImportDialog({ currentSong, onApply, onReset, onClose }: SongImportDialogProps) {
  const [tab, setTab] = useState<Tab>('library');
  const [text, setText] = useState(() => songToChordGrid(currentSong));

  const parse = useMemo(() => parseChordGrid(text), [text]);

  const loadFromLibrary = (id: string) => {
    const entry = SONG_LIBRARY.find((s) => s.id === id);
    if (!entry) return;
    setText(entry.grid);
    setTab('edit');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canApply = parse.song !== null && parse.errors.length === 0;

  return (
    <div className="gg-closeup" role="dialog" aria-modal="true" aria-label="Import song" onClick={onClose}>
      <div className="gg-closeup-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
        <div className="gg-closeup-header">
          <div className="gg-closeup-title">
            <span className="tag">Song</span>
            <span className="name" style={{ fontSize: 36 }}>Import / Edit</span>
          </div>
          <button className="gg-closeup-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={{ padding: '14px 24px 0', display: 'flex', gap: 6, borderBottom: '3px solid var(--ink)' }}>
          {(['library', 'edit'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              style={{
                padding: '10px 18px',
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontFamily: 'inherit',
                background: tab === t ? 'var(--ink)' : 'transparent',
                color: tab === t ? 'var(--bg)' : 'var(--ink)',
                border: '3px solid var(--ink)',
                borderBottom: 'none',
                borderRadius: '10px 10px 0 0',
                cursor: 'pointer',
                marginBottom: -3,
              }}>
              {t === 'library' ? '📚 Library' : '✎ Edit / paste'}
            </button>
          ))}
        </div>

        {tab === 'library' && (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SONG_LIBRARY.map((entry) => (
              <button
                key={entry.id}
                onClick={() => loadFromLibrary(entry.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  textAlign: 'left',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  border: '3px solid var(--ink)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  boxShadow: '3px 3px 0 var(--ink)',
                  fontFamily: 'inherit',
                }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{entry.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-mute)', fontWeight: 700 }}>{entry.artist} · {entry.description}</div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    fontWeight: 900,
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: entry.difficulty === 'beginner' ? 'var(--accent-green)' : 'var(--accent-orange)',
                    color: '#fff',
                  }}>
                  {entry.difficulty}
                </span>
              </button>
            ))}
            <div style={{ fontSize: 12, color: 'var(--ink-mute)', fontWeight: 700 }}>
              Click a song to load it into the editor — you can tweak BPM / chords / lyrics before loading.
            </div>
          </div>
        )}

        {tab === 'edit' && (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label htmlFor="song-text" style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-mute)' }}>
            Chord-grid format
          </label>
          <textarea
            id="song-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            rows={14}
            style={{
              width: '100%',
              fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
              fontSize: 15,
              lineHeight: 1.55,
              padding: 14,
              border: '3px solid var(--ink)',
              borderRadius: 8,
              background: 'var(--surface-2)',
              color: 'var(--ink)',
              resize: 'vertical',
            }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: 12, border: '2px dashed var(--ink)', borderRadius: 8, background: 'var(--bg-alt)' }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.14em', color: 'var(--ink-mute)', marginBottom: 6 }}>
                Preview
              </div>
              {parse.song ? (
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  <b style={{ fontSize: 20 }}>{parse.song.title}</b>
                  {parse.song.artist && <span style={{ color: 'var(--ink-mute)' }}> · {parse.song.artist}</span>}
                  <div>♩ = {parse.song.bpm} · {parse.song.beatsPerBar}/4 · {parse.song.bars.length} bars · {parse.song.sections.length} sections</div>
                </div>
              ) : (
                <div style={{ color: 'var(--ink-mute)' }}>Paste or edit a song above to see a preview.</div>
              )}
            </div>

            <div style={{ padding: 12, border: `2px dashed ${parse.errors.length ? 'var(--accent)' : 'var(--ink)'}`, borderRadius: 8, background: 'var(--bg-alt)' }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.14em', color: 'var(--ink-mute)', marginBottom: 6 }}>
                Validation
              </div>
              {parse.errors.length === 0 && parse.unknownChords.length === 0 && (
                <div style={{ fontWeight: 700, color: 'var(--accent-green)' }}>✓ Ready to load</div>
              )}
              {parse.errors.map((err, i) => (
                <div key={i} style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>
                  Line {err.line}: {err.message}
                </div>
              ))}
              {parse.unknownChords.length > 0 && (
                <div style={{ fontSize: 13, marginTop: 6, color: 'var(--ink-mute)' }}>
                  Unknown chord shapes — will render as empty boxes: <b>{parse.unknownChords.join(', ')}</b>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap' }}>
            <button
              onClick={onReset}
              style={{
                padding: '14px 18px', fontSize: 15, fontWeight: 800,
                background: 'var(--surface)', color: 'var(--ink)',
                border: '3px solid var(--ink)', borderRadius: 8, cursor: 'pointer',
                minHeight: 56, boxShadow: '3px 3px 0 var(--ink)',
              }}>
              ↺ Reset to sample song
            </button>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  padding: '14px 18px', fontSize: 15, fontWeight: 800,
                  background: 'var(--surface)', color: 'var(--ink)',
                  border: '3px solid var(--ink)', borderRadius: 8, cursor: 'pointer',
                  minHeight: 56, boxShadow: '3px 3px 0 var(--ink)',
                }}>
                Cancel
              </button>
              <button
                onClick={() => parse.song && onApply(parse.song)}
                disabled={!canApply}
                style={{
                  padding: '14px 22px', fontSize: 16, fontWeight: 900,
                  background: canApply ? 'var(--accent)' : 'var(--surface-2)',
                  color: canApply ? '#fff' : 'var(--ink-mute)',
                  border: '3px solid var(--ink)', borderRadius: 8,
                  cursor: canApply ? 'pointer' : 'not-allowed',
                  minHeight: 56,
                  boxShadow: canApply ? '3px 3px 0 var(--ink)' : 'none',
                }}>
                Load song ▶
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

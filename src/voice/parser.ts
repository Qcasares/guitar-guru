// Loose utterance → command parser. Keyword-set matching: every command
// has a list of recognised phrases; the first one found in the lower-cased
// transcript wins. Deliberately permissive because recognition drops words
// ("play" often comes back as "please" / "plate" etc.).

export type Command =
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'toggle-play' }
  | { kind: 'next' }
  | { kind: 'prev' }
  | { kind: 'restart' }
  | { kind: 'tempo'; scale: number }
  | { kind: 'tempo-delta'; delta: number }
  | { kind: 'loop' }
  | { kind: 'listen' }
  | { kind: 'listen-off' }
  | { kind: 'mode-rhythm' }
  | { kind: 'mode-lead' }
  | { kind: 'toggle-mode' }
  | { kind: 'status' }
  | { kind: 'closeup' }
  | { kind: 'count-in' }
  | { kind: 'narrate' }
  | { kind: 'spotlight' }
  | { kind: 'loop-a' }
  | { kind: 'loop-b' }
  | { kind: 'loop-clear' };

interface Rule {
  phrases: string[];
  build: (m: RegExpMatchArray | null) => Command;
  /** Optional regex for parameterised commands (e.g. "tempo 60 percent"). */
  regex?: RegExp;
}

const RULES: Rule[] = [
  { phrases: ['pause', 'stop'], build: () => ({ kind: 'pause' }) },
  { phrases: ['play', 'resume', 'go'], build: () => ({ kind: 'play' }) },
  { phrases: ['next', 'forward', 'skip'], build: () => ({ kind: 'next' }) },
  { phrases: ['back', 'previous', 'rewind'], build: () => ({ kind: 'prev' }) },
  { phrases: ['restart', 'start over', 'from the top'], build: () => ({ kind: 'restart' }) },
  { phrases: ['half speed', 'half tempo'], build: () => ({ kind: 'tempo', scale: 0.5 }) },
  { phrases: ['three quarter', 'three-quarter', 'three quarters'], build: () => ({ kind: 'tempo', scale: 0.75 }) },
  { phrases: ['full speed', 'normal speed', 'full tempo'], build: () => ({ kind: 'tempo', scale: 1 }) },
  { phrases: ['faster', 'speed up', 'speed it up'], build: () => ({ kind: 'tempo-delta', delta: 0.25 }) },
  { phrases: ['slower', 'slow down'], build: () => ({ kind: 'tempo-delta', delta: -0.25 }) },
  { phrases: ['loop'], build: () => ({ kind: 'loop' }) },
  { phrases: ['stop listening', "don't listen"], build: () => ({ kind: 'listen-off' }) },
  { phrases: ['listen', 'mic on'], build: () => ({ kind: 'listen' }) },
  { phrases: ['where am i', 'status', 'where'], build: () => ({ kind: 'status' }) },
  { phrases: ['zoom', 'close up', 'close-up'], build: () => ({ kind: 'closeup' }) },
  { phrases: ['rhythm mode', 'rhythm'], build: () => ({ kind: 'mode-rhythm' }) },
  { phrases: ['god mode', 'lead', 'godmode'], build: () => ({ kind: 'mode-lead' }) },
  { phrases: ['switch mode', 'change mode'], build: () => ({ kind: 'toggle-mode' }) },
  { phrases: ['count in', 'count-in'], build: () => ({ kind: 'count-in' }) },
  { phrases: ['describe', 'narrate', 'spell out', 'read chord'], build: () => ({ kind: 'narrate' }) },
  { phrases: ['focus mode', 'spotlight', 'dim'], build: () => ({ kind: 'spotlight' }) },
  { phrases: ['clear loop', 'clear markers', 'reset loop'], build: () => ({ kind: 'loop-clear' }) },
  { phrases: ['set a', 'mark a', 'loop start'], build: () => ({ kind: 'loop-a' }) },
  { phrases: ['set b', 'mark b', 'loop end'], build: () => ({ kind: 'loop-b' }) },
];

export function parseCommand(transcript: string): Command | null {
  const text = transcript.toLowerCase();

  // Numeric tempo: "tempo 80 percent" or "80 percent speed"
  const tempoMatch = text.match(/(\d{2,3})\s*(percent|%)/);
  if (tempoMatch) {
    const pct = Number(tempoMatch[1]);
    if (pct >= 25 && pct <= 200) return { kind: 'tempo', scale: pct / 100 };
  }

  for (const rule of RULES) {
    for (const phrase of rule.phrases) {
      if (text.includes(phrase)) return rule.build(null);
    }
  }
  return null;
}

/** Human-readable label for a command, for toast feedback. */
export function commandLabel(cmd: Command): string {
  switch (cmd.kind) {
    case 'play': return 'Play';
    case 'pause': return 'Pause';
    case 'toggle-play': return 'Play / pause';
    case 'next': return 'Next bar';
    case 'prev': return 'Previous bar';
    case 'restart': return 'Restart';
    case 'tempo': return `Tempo ${Math.round(cmd.scale * 100)}%`;
    case 'tempo-delta': return cmd.delta > 0 ? 'Faster' : 'Slower';
    case 'loop': return 'Loop toggled';
    case 'listen': return 'Listening';
    case 'listen-off': return 'Stopped listening';
    case 'mode-rhythm': return 'Rhythm mode';
    case 'mode-lead': return 'Lead GODMODE';
    case 'toggle-mode': return 'Mode toggled';
    case 'status': return 'Status';
    case 'closeup': return 'Close-up';
    case 'count-in': return 'Count-in toggled';
    case 'narrate': return 'Narrating chord';
    case 'spotlight': return 'Focus spotlight toggled';
    case 'loop-a': return 'Loop A';
    case 'loop-b': return 'Loop B';
    case 'loop-clear': return 'Loop cleared';
  }
}

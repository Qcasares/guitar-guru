import type { Finger } from './types';

export const FINGER_COLOR: Record<Finger, string> = {
  1: '#e53935', // index — red
  2: '#1e88e5', // middle — blue
  3: '#43a047', // ring — green
  4: '#fb8c00', // pinky — orange
  T: '#8e24aa', // thumb — purple
};

export const FINGER_NAME: Record<Finger, string> = {
  1: 'index',
  2: 'middle',
  3: 'ring',
  4: 'pinky',
  T: 'thumb',
};

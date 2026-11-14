export const C = {
  paper: '#f3ead9', paperDeep: '#e8dcc4', wood: '#3b2a20', woodSoft: '#6a5142', ink: '#2a1f18', inkSoft: '#6d5f54',
  vermilion: '#a63d2f', gold: '#c9a24a', cushion: '#8c2f25', cushionEmpty: '#b8975f', floor: '#d6b98c', line: '#cdbb9c',
};
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${two(m)}:${two(r)}`;
}

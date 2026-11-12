import React from 'react';
import Svg, { Circle, Ellipse, Path, G } from 'react-native-svg';
import type { Monk } from './api';
import { C } from './theme';

/** One little monk, drawn from the look the server derived from the person's ID. */
export function MonkFigure({ monk, size = 64, me = false }: { monk: Monk; size?: number; me?: boolean }) {
  const { skin, robe, face, beads } = monk.look;
  const sitting = monk.sitting;
  const headY = sitting ? 26 : 18;
  return (
    <Svg width={size} height={size * 1.17} viewBox="0 0 60 70">
      {me && <Ellipse cx={30} cy={63} rx={28} ry={7.5} fill="none" stroke={C.gold} strokeWidth={2} />}
      <Ellipse cx={30} cy={63} rx={23} ry={5.5} fill={C.cushion} />
      {sitting ? (
        <G>
          <Path d="M8 62 Q9 40 30 36 Q51 40 52 62 Q30 68 8 62 Z" fill={robe} />
          <Path d="M20 40 Q30 50 44 60" stroke="#00000022" strokeWidth={3} fill="none" />
          <Circle cx={30} cy={54} r={4.2} fill={skin} />
        </G>
      ) : (
        <G>
          <Path d="M17 62 Q16 34 30 29 Q44 34 43 62 Z" fill={robe} />
          <Path d="M22 34 Q30 44 40 58" stroke="#00000022" strokeWidth={3} fill="none" />
          <Path d="M26 42 L30 37 L34 42 Z" fill={skin} />
        </G>
      )}
      <Circle cx={17.5} cy={headY + 1} r={3} fill={skin} />
      <Circle cx={42.5} cy={headY + 1} r={3} fill={skin} />
      <Circle cx={30} cy={headY} r={13} fill={skin} />
      {sitting ? (
        <G stroke={C.ink} strokeWidth={1.4} fill="none" strokeLinecap="round">
          <Path d={`M22.5 ${headY + 1} q2.5 2.2 5 0`} />
          <Path d={`M32.5 ${headY + 1} q2.5 2.2 5 0`} />
        </G>
      ) : (
        <G fill={C.ink}>
          <Circle cx={25} cy={headY + 1} r={1.5} />
          <Circle cx={35} cy={headY + 1} r={1.5} />
        </G>
      )}
      {monk.gender === 'f' && (
        <G>
          <Circle cx={21.5} cy={headY + 6} r={2.6} fill="#e9907a55" />
          <Circle cx={38.5} cy={headY + 6} r={2.6} fill="#e9907a55" />
          <Path d={`M21.5 ${headY - 0.5} l-1.8 -1.6 M38.5 ${headY - 0.5} l1.8 -1.6`} stroke={C.ink} strokeWidth={1.1} strokeLinecap="round" />
        </G>
      )}
      <Path d={face % 2 === 0 ? `M27 ${headY + 7} q3 2.4 6 0` : `M27.5 ${headY + 7.6} h5`} stroke={C.ink} strokeWidth={1.3} fill="none" strokeLinecap="round" />
      {face >= 2 && <Circle cx={30} cy={headY - 6} r={1.2} fill={C.vermilion} />}
      {beads && [22, 26, 30, 34, 38].map((x, i) => (
        <Circle key={x} cx={x} cy={headY + 14.5 + (i === 2 ? 2 : i % 2 ? 1.2 : 0)} r={1.5} fill={C.wood} />
      ))}
    </Svg>
  );
}

export function EmptyCushion({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.17} viewBox="0 0 60 70">
      <Ellipse cx={30} cy={63} rx={23} ry={5.5} fill={C.cushionEmpty} />
    </Svg>
  );
}

import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { Monk } from './api';
import { EmptyCushion, MonkFigure } from './MonkFigure';
import { C } from './theme';

/** The temple as a flat drawing, for devices that cannot draw the 3D one. */
export function FlatTemple() {
  return (
    <View style={styles.temple}>
      <Svg width={300} height={210} viewBox="0 0 300 210">
        <Circle cx={222} cy={40} r={26} fill="#fff6dc" />
        <Path d="M0 160 L70 84 L140 160 Z" fill="#c3ccb4" /><Path d="M160 160 L240 76 L300 140 L300 160 Z" fill="#b3c0aa" />
        <Rect x={0} y={160} width={300} height={50} fill="#8fa863" />
        {/* great hipped roof with golden horns */}
        <Path d="M100 58 L200 58 L262 104 Q150 96 38 104 Z" fill="#4d5861" />
        <Rect x={98} y={54} width={104} height={5} fill="#31373b" />
        <Path d="M98 54 Q96 40 108 36 Q104 44 108 54 Z" fill="#e0b24c" /><Path d="M202 54 Q204 40 192 36 Q196 44 192 54 Z" fill="#e0b24c" />
        <Rect x={70} y={104} width={160} height={16} fill="#efe6d2" />
        {[70, 96, 122, 148, 174, 200, 226].map(x => <Rect key={x} x={x} y={104} width={4} height={16} fill="#4a3122" />)}
        {/* skirt roof and the cusped gable over the door */}
        <Path d="M66 118 L234 118 L274 140 Q150 134 26 140 Z" fill="#4d5861" />
        <Path d="M118 140 Q132 138 138 126 Q150 114 162 126 Q168 138 182 140 Z" fill="#efe6d2" stroke="#4d5861" strokeWidth={4} />
        <Rect x={143} y={127} width={14} height={9} fill="#1b120c" /><Circle cx={150} cy={131.5} r={3} fill="#d8aa48" />
        <Rect x={46} y={140} width={208} height={44} fill="#efe6d2" />
        {[46, 76, 106, 136, 160, 190, 220, 250].map(x => <Rect key={x} x={x} y={140} width={4} height={44} fill="#4a3122" />)}
        {[80, 110, 164, 194].map(x => <Rect key={x} x={x} y={152} width={26} height={32} fill="#6b3a26" />)}
        <Rect x={140} y={150} width={20} height={34} fill="#1b120c" /><Circle cx={150} cy={164} r={6} fill="#c99a3c" />
        <Rect x={30} y={184} width={240} height={10} fill="#a8a094" /><Rect x={128} y={194} width={44} height={7} fill="#b5ad9f" />
        {/* bronze lantern */}
        <Rect x={147} y={196} width={6} height={8} fill="#5f6b5a" /><Path d="M141 190 L159 190 L156 196 L144 196 Z" fill="#5f6b5a" /><Rect x={146} y={191} width={8} height={4} fill="#ffd98a" />
      </Svg>
    </View>
  );
}

/** The hall as rows of cushions seen from above the altar, for devices that cannot draw the 3D one. */
export function FlatHall({ monks, seats, meHandle, onBow }: { monks: Monk[]; seats: number; meHandle: string; onBow: (m: Monk) => void }) {
  const { width } = useWindowDimensions();
  const columns = 8;
  const cell = Math.floor(Math.min(width, 900) / columns);
  const bySeat = new Map<number, Monk>();
  for (const m of monks) if (m.seat !== null) bySeat.set(m.seat, m);
  const data = Array.from({ length: seats }, (_, seat) => ({ seat, monk: bySeat.get(seat) ?? null }));
  const figure = Math.min(cell - 6, 64);
  return (
    <FlatList
      testID="hall.flat" style={styles.hall} data={data} numColumns={columns} keyExtractor={i => String(i.seat)}
      contentContainerStyle={styles.floor} initialNumToRender={columns * 8}
      ListHeaderComponent={<Text style={styles.altar}>大 佛</Text>}
      renderItem={({ item }) => {
        const m = item.monk, mine = !!m && m.handle === meHandle;
        if (!m) return <View style={[styles.cell, { width: cell }]}><EmptyCushion size={figure} /></View>;
        return (
          <Pressable disabled={mine} onPress={() => onBow(m)} style={[styles.cell, { width: cell }]} accessibilityRole="button"
            accessibilityLabel={`${m.name}，${m.sitting ? '静坐中' : '站立'}${mine ? '，这是你' : '，点按合十'}`}>
            <MonkFigure monk={m} size={figure} me={mine} />
            <Text style={[styles.name, mine && styles.nameMe]} numberOfLines={1}>{m.name}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  temple: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1d9b0', paddingBottom: 200 },
  hall: { flex: 1, backgroundColor: C.floor },
  floor: { paddingTop: 66, paddingBottom: 40, alignItems: 'center' },
  altar: { alignSelf: 'center', marginBottom: 10, paddingVertical: 10, paddingHorizontal: 60, backgroundColor: '#6e241c', color: C.gold,
           fontSize: 18, fontWeight: '700', letterSpacing: 8, borderRadius: 8, overflow: 'hidden' },
  cell: { alignItems: 'center', paddingVertical: 4, minHeight: 44 },
  name: { fontSize: 11, color: C.wood, marginTop: -2 },
  nameMe: { fontWeight: '700', color: C.vermilion },
});

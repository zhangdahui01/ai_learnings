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
        <Circle cx={212} cy={46} r={30} fill="#fff4d6" />
        <Path d="M0 150 L70 70 L140 150 Z" fill="#c9cdb6" /><Path d="M150 150 L235 60 L300 130 L300 150 Z" fill="#b7c1ad" />
        <Path d="M78 78 L150 44 L222 78 L212 86 L88 86 Z" fill="#3d4a4a" />
        <Rect x={100} y={86} width={100} height={18} fill="#e9dcc0" /><Rect x={128} y={89} width={44} height={12} fill="#1f2a44" />
        <Path d="M40 126 L150 96 L260 126 L246 136 L54 136 Z" fill="#3d4a4a" />
        <Rect x={56} y={134} width={188} height={5} fill="#1f6b62" />
        <Rect x={62} y={139} width={176} height={44} fill="#e9dcc0" /><Rect x={136} y={144} width={28} height={39} fill="#3a2317" />
        {[66, 100, 128, 164, 192, 226].map(x => <Rect key={x} x={x} y={139} width={8} height={44} fill={C.vermilion} />)}
        <Rect x={44} y={183} width={212} height={12} fill="#a8a094" /><Rect x={126} y={195} width={48} height={8} fill="#b5ad9f" />
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
      ListHeaderComponent={<Text style={styles.altar}>佛 台</Text>}
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

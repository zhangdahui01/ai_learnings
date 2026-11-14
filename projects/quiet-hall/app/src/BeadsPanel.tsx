import React, { useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { C } from './theme';

const RING = 18;             // beads drawn on the loop; a full mala is 108 = six turns of this loop
export const MALA = 108;

/** A string of prayer beads. Tap the loop to slide one bead past your thumb; 108 beads make one round. */
export function BeadsPanel({ count, onBead, onClose }: { count: number; onBead: () => void; onClose: () => void }) {
  const turn = useRef(new Animated.Value(0)).current;
  const steps = useRef(0);
  const bead = () => {
    steps.current += 1;
    Animated.timing(turn, { toValue: steps.current, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    onBead();
  };
  const rounds = Math.floor(count / MALA), inRound = count % MALA;
  const spin = turn.interpolate({ inputRange: [0, RING], outputRange: ['0deg', '360deg'] });
  return (
    <View style={styles.sheet} testID="beads.panel">
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">念珠</Text>
        <Pressable testID="beads.close" onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="收起念珠" style={styles.close}>
          <Text style={styles.closeText}>收起</Text>
        </Pressable>
      </View>
      <Pressable testID="beads.bead" onPress={bead} accessibilityRole="button" accessibilityLabel="拨一颗念珠" style={styles.loopWrap}>
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <Svg width={210} height={210} viewBox="-105 -105 210 210">
            <Circle r={82} fill="none" stroke="#8a6a3a" strokeWidth={2} />
            {Array.from({ length: RING }, (_, i) => {
              const a = (i / RING) * Math.PI * 2 - Math.PI / 2;
              return (
                <G key={i}>
                  <Circle cx={Math.cos(a) * 82} cy={Math.sin(a) * 82} r={i === 0 ? 14 : 11.5} fill={i === 0 ? C.gold : '#6b3b22'} />
                  <Circle cx={Math.cos(a) * 82 - 3.5} cy={Math.sin(a) * 82 - 3.5} r={3} fill="#ffffff55" />
                </G>
              );
            })}
            <Path d="M0 -96 l-5 -14 h10 z" fill={C.vermilion} />
          </Svg>
        </Animated.View>
        <View style={styles.center} pointerEvents="none">
          <Text testID="beads.count" style={styles.count}>{inRound}</Text>
          <Text style={styles.of}>/ {MALA}</Text>
        </View>
      </Pressable>
      <View style={styles.inline}>
        <Text style={styles.note}>已圆满 </Text><Text testID="beads.rounds" style={styles.note}>{rounds}</Text><Text style={styles.note}> 圈 · 点念珠拨一颗</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#f3ead9', borderTopWidth: 1, borderColor: '#cdbb9c', borderTopLeftRadius: 22, borderTopRightRadius: 22,
           paddingTop: 12, paddingBottom: 16, alignItems: 'center', gap: 4 },
  head: { width: '100%', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  title: { fontSize: 18, fontWeight: '700', color: C.wood, letterSpacing: 6 },
  close: { position: 'absolute', right: 16, height: 44, justifyContent: 'center' },
  closeText: { color: C.inkSoft, fontSize: 14 },
  loopWrap: { width: 210, height: 210, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center' },
  count: { fontSize: 40, fontWeight: '700', color: C.wood, fontVariant: ['tabular-nums'] },
  of: { fontSize: 13, color: C.inkSoft },
  inline: { flexDirection: 'row' },
  note: { fontSize: 13, color: C.inkSoft },
});

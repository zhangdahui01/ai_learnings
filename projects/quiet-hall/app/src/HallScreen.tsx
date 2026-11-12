import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, HallError, type HallSnapshot, type Session } from './api';
import { BeadsPanel, MALA } from './BeadsPanel';
import { MonkFigure } from './MonkFigure';
import { playBell, playKnock, playTick, setChanting, soundStatus, soundSupported, TRACKS } from './sound';
import { useBatched } from './useBatched';
import { HallScene } from './three/HallScene';
import { useOrbit, type Orbit } from './three/orbit';
import { Canvas } from './three/r3f';
import { C, clock } from './theme';

const POLL_MS = 2000;
// Where you stand to look at the hall: behind your cushion, from the side, or from the altar looking back.
const VIEWS: { label: string; orbit: Orbit }[] = [
  { label: '身后', orbit: { yaw: 0.55, pitch: 0.34, dist: 9.5 } },
  { label: '侧面', orbit: { yaw: 1.45, pitch: 0.22, dist: 14 } },
  { label: '佛前', orbit: { yaw: 2.9, pitch: 0.28, dist: 12 } },
  { label: '高处', orbit: { yaw: 0.15, pitch: 0.75, dist: 26 } },
];

export function HallScreen({ session, onLeft }: { session: Session; onLeft: () => void }) {
  const [hall, setHall] = useState<HallSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [tick, setTick] = useState(0);
  const [notice, setNotice] = useState('');
  const [offline, setOffline] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [track, setTrack] = useState(soundSupported && TRACKS.length ? 0 : -1);       // -1 = chanting off
  const [knockTick, setKnockTick] = useState(0);
  const [bowTick, setBowTick] = useState(0);
  const [beadsOpen, setBeadsOpen] = useState(false);
  const [walkTo, setWalkTo] = useState<{ x: number; z: number } | null>(null);        // where I am walking, before the hall confirms
  const rise = useRef(new Animated.Value(0)).current;
  const [riseText, setRiseText] = useState('功德 +1');
  const [view, setView] = useState(0);
  const { orbit, handlers, zoom } = useOrbit(VIEWS[0].orbit);
  const nextView = useCallback(() => {
    setView(v => { const n = (v + 1) % VIEWS.length; Object.assign(orbit.current, VIEWS[n].orbit); return n; });
  }, [orbit]);

  const say = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 2500);
  }, []);
  const float = useCallback((text: string) => {
    setRiseText(text); rise.setValue(0);
    Animated.timing(rise, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [rise]);

  const refresh = useCallback(async () => {
    try {
      const snap = await api.hall(session);
      if (!snap.me) { onLeft(); return; }
      setHall(snap); setFetchedAt(Date.now()); setOffline(false);
    } catch (e) {
      if (e instanceof HallError && e.status === 401) onLeft(); else setOffline(true);
    }
  }, [session, onLeft]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const second = setInterval(() => setTick(t => t + 1), 1000);
    return () => { clearInterval(poll); clearInterval(second); if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, [refresh]);

  const act = useCallback(async (run: () => Promise<unknown>, done?: string) => {
    try { await run(); if (done) say(done); await refresh(); }
    catch (e) { say(e instanceof HallError ? e.message : '没有成功，请再试一次'); }
  }, [refresh, say]);

  useEffect(() => { setChanting(track >= 0 ? TRACKS[track].id : null); }, [track]);
  useEffect(() => () => setChanting(null), []);
  const nextTrack = useCallback(() => {
    setTrack(t => { const n = t + 1 >= TRACKS.length ? -1 : t + 1; if (n >= 0) say(TRACKS[n].credit); return n; });
  }, [say]);
  // A page restored without a tap (reload, coming back later) is not allowed to make sound yet: say so.
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!soundSupported) return;
    const check = setInterval(() => setBlocked(track >= 0 && soundStatus().state === 'blocked'), 1000);
    return () => clearInterval(check);
  }, [track]);

  // Counted practices answer at once and reach the hall in batches.
  const saved = useCallback((me: HallSnapshot['me']) => setHall(h => (h ? { ...h, me } : h)), []);
  const knocks = useBatched(n => api.knock(session, n), saved);
  const bows = useBatched(n => api.prostrate(session, n), saved);
  const beads = useBatched(n => api.beads(session, n), saved);

  const me = hall?.me ?? null;
  const knock = useCallback(() => {
    playKnock(); setKnockTick(t => t + 1); float('功德 +1'); knocks.add();
  }, [knocks, float]);
  const prostrate = useCallback(() => {
    playBell(); setBowTick(t => t + 1); bows.add();
    const total = (me?.prostrations ?? 0) + bows.extra + 1;
    float(total % MALA === 0 ? `礼拜 ${total} · 一百零八拜圆满` : `礼拜 ${total}`);
  }, [bows, float, me]);
  const bead = useCallback(() => {
    playTick(); beads.add();
    const total = (me?.beads ?? 0) + beads.extra + 1;
    if (total % MALA === 0) { playBell(); say(`念珠第 ${total / MALA} 圈圆满`); }
  }, [beads, me, say]);

  // Tap the floor to walk there. A seated monk stays seated: stand up first.
  const walk = useCallback((x: number, z: number) => {
    if (!me) return;
    if (me.sitting) { say('先起身，再走动'); return; }
    setWalkTo({ x, z });
    api.move(session, x, z).then(res => saved(res.me)).catch(() => say('没走成，请再试一次'));
  }, [me, session, saved, say]);
  useEffect(() => { if (me?.sitting) setWalkTo(null); }, [me?.sitting]);

  const drift = me?.sitting ? Math.floor((Date.now() - fetchedAt) / 1000) : 0;   // seconds since the last poll
  void tick;

  if (!hall || !me) {
    return <View style={styles.loading}><Text testID="hall.loading" style={styles.muted}>{offline ? '连不上大殿，正在重试…' : '正在入殿…'}</Text></View>;
  }
  const mine = walkTo && !me.sitting ? { ...me, pos: walkTo } : me;
  const monks = hall.monks.map(m => (m.handle === me.handle ? mine : m));
  const stat = (label: string, id: string, value: string | number) => (
    <View style={styles.stat} key={id}><Text style={styles.statLabel}>{label} </Text><Text testID={id} style={styles.statValue}>{value}</Text></View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">大殿</Text>
        <View style={styles.counts}>
          <View style={styles.inline}>
            <Text style={styles.count}>在堂 </Text><Text testID="hall.count" style={[styles.count, styles.countNum]}>{hall.present}</Text><Text style={styles.count}> 人</Text>
          </View>
          <View style={styles.inline}>
            <Text style={styles.count}>静坐 </Text><Text testID="hall.sitting" style={[styles.count, styles.countNum]}>{hall.sitting}</Text><Text style={styles.count}> 人</Text>
          </View>
        </View>
        {offline && <Text testID="hall.offline" style={styles.offline}>网络不稳，显示的是刚才的大殿</Text>}
      </View>

      <View testID="hall.scene" style={styles.stage} {...handlers}
        {...(Platform.OS === 'web' ? { onWheel: (e: { deltaY: number }) => zoom(e.deltaY > 0 ? 1.1 : 0.9) } : {})}>
        <Canvas style={styles.canvas} dpr={[1, 2]} camera={{ fov: 58, near: 0.1, far: 220, position: [6, 5, 14] }}>
          <HallScene monks={monks} seats={hall.seats} meHandle={me.handle} orbit={orbit} knockTick={knockTick} onKnock={knock}
            bowTick={bowTick} onFloor={walk} onBow={m => act(() => api.bow(session, m.handle), `向${m.name}合十`)} />
        </Canvas>
        <View style={styles.viewBar} pointerEvents="box-none">
          {soundSupported && TRACKS.length > 0 && (
            <Pressable testID="hall.sound" onPress={nextTrack} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
              accessibilityRole="button" accessibilityLabel={`诵经声，当前${track >= 0 ? TRACKS[track].title : '关闭'}，点按切换`}>
              <Text style={styles.chipText}>诵经 · {track >= 0 ? TRACKS[track].title : '关'}</Text>
            </Pressable>
          )}
          <Pressable testID="hall.view" onPress={nextView} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            accessibilityRole="button" accessibilityLabel={`切换视角，当前${VIEWS[view].label}`}>
            <Text style={styles.chipText}>视角 · {VIEWS[view].label}</Text>
          </Pressable>
          <Pressable testID="hall.zoom.in" onPress={() => zoom(0.8)} style={({ pressed }) => [styles.chip, styles.chipRound, pressed && styles.pressed]}
            accessibilityRole="button" accessibilityLabel="靠近"><Text style={styles.chipText}>＋</Text></Pressable>
          <Pressable testID="hall.zoom.out" onPress={() => zoom(1.25)} style={({ pressed }) => [styles.chip, styles.chipRound, pressed && styles.pressed]}
            accessibilityRole="button" accessibilityLabel="拉远"><Text style={styles.chipText}>－</Text></Pressable>
        </View>
        <Animated.Text testID="hall.rise" pointerEvents="none" style={[styles.rise, {
          opacity: rise.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -70] }) }] }]}>
          {riseText}
        </Animated.Text>
        {!!notice && <View style={styles.toast} pointerEvents="none"><Text testID="hall.notice" style={styles.toastText}>{notice}</Text></View>}
        <Text testID="hall.hint" style={styles.hint} pointerEvents="none">
          {blocked ? '点一下屏幕，开启诵经声' : me.sitting ? '拖动环顾 · 点木鱼敲一下 · 点和尚向他合十' : '点地面走过去 · 拖动环顾 · 点和尚向他合十'}
        </Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.meRow}>
          <MonkFigure monk={me} size={42} />
          <View style={styles.meText}>
            <View style={styles.inline}>
              <Text testID="hall.me.name" style={styles.meName}>{me.name}</Text><Text testID="hall.me.handle" style={styles.muted}>  @{me.handle}</Text>
            </View>
            <View style={styles.stats}>
              {stat('累计', 'hall.me.total', clock(me.totalSeconds + drift))}
              {stat('功德', 'hall.me.merit', me.merit + knocks.extra)}
              {stat('礼拜', 'hall.me.prostrations', me.prostrations + bows.extra)}
              {stat('念珠', 'hall.me.beads', me.beads + beads.extra)}
              {stat('受礼', 'hall.me.bows', me.bows)}
            </View>
          </View>
          <View style={styles.timerBox}>
            <Text testID="hall.me.state" style={styles.muted}>{me.sitting ? '静坐中' : '未入坐'}</Text>
            <Text testID="hall.me.timer" style={styles.timer}>{clock(me.sittingSeconds + drift)}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          {me.sitting ? (
            <Pressable testID="hall.stand" style={({ pressed }) => [styles.primary, styles.secondary, pressed && styles.pressed]}
              onPress={() => { playBell(); act(() => api.stand(session), '起身，可以在殿内走动'); }} accessibilityRole="button" accessibilityLabel="起身">
              <Text style={[styles.primaryText, styles.secondaryText]}>起身</Text>
            </Pressable>
          ) : (
            <Pressable testID="hall.sit" style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              onPress={() => { playBell(); act(() => api.sit(session), '回到蒲团入坐'); }} accessibilityRole="button" accessibilityLabel="坐下">
              <Text style={styles.primaryText}>坐下</Text>
            </Pressable>
          )}
          <Pressable testID="hall.prostrate" style={({ pressed }) => [styles.ghost, pressed && styles.tapped]}
            onPress={prostrate} accessibilityRole="button" accessibilityLabel="礼拜一次">
            <Text style={styles.ghostText}>礼拜</Text>
          </Pressable>
          <Pressable testID="hall.knock" style={({ pressed }) => [styles.ghost, pressed && styles.tapped]}
            onPress={knock} accessibilityRole="button" accessibilityLabel="敲木鱼，功德加一">
            <Text style={styles.ghostText}>木鱼</Text>
          </Pressable>
          <Pressable testID="hall.beads" style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
            onPress={() => setBeadsOpen(true)} accessibilityRole="button" accessibilityLabel="拿起念珠">
            <Text style={styles.ghostText}>念珠</Text>
          </Pressable>
        </View>
        <View style={styles.actions}>
          <Pressable testID="hall.bow" style={({ pressed }) => [styles.minor, pressed && styles.pressed]}
            onPress={() => act(() => api.bow(session), '向大众合十')} accessibilityRole="button" accessibilityLabel="向大众合十">
            <Text style={styles.minorText}>向大众合十</Text>
          </Pressable>
          <Pressable testID="hall.leave" style={({ pressed }) => [styles.minor, pressed && styles.pressed]}
            onPress={async () => { try { await api.leave(session); } catch { /* leaving locally is enough */ } onLeft(); }}
            accessibilityRole="button" accessibilityLabel="离寺">
            <Text style={styles.minorText}>离寺</Text>
          </Pressable>
        </View>
        {beadsOpen && <BeadsPanel count={me.beads + beads.extra} onBead={bead} onClose={() => setBeadsOpen(false)} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1c120c' },
  stage: { flex: 1, minHeight: 200 },
  canvas: { flex: 1 },
  viewBar: { position: 'absolute', top: 10, right: 10, left: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  chip: { height: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: '#2a1f18cc', borderWidth: 1, borderColor: '#c9a24a88', alignItems: 'center', justifyContent: 'center' },
  chipRound: { width: 44, paddingHorizontal: 0 },
  chipText: { color: '#f3ead9', fontSize: 14 },
  rise: { position: 'absolute', left: 0, right: 0, bottom: 96, textAlign: 'center', color: '#ffd978', fontSize: 22, fontWeight: '700' },
  hint: { position: 'absolute', left: 0, right: 0, bottom: 8, textAlign: 'center', color: '#f3ead9aa', fontSize: 12 },
  loading: { flex: 1, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: C.wood, paddingTop: 14, paddingBottom: 12, paddingHorizontal: 20, alignItems: 'center', gap: 4 },
  title: { color: C.gold, fontSize: 22, fontWeight: '700', letterSpacing: 10 },
  counts: { flexDirection: 'row', gap: 20 },
  inline: { flexDirection: 'row', alignItems: 'baseline' },
  count: { color: '#e9dcc3', fontSize: 14 },
  countNum: { color: '#fff', fontWeight: '700', fontVariant: ['tabular-nums'] },
  offline: { color: '#f2c9a0', fontSize: 12 },
  toast: { position: 'absolute', left: 0, right: 0, bottom: 40, alignItems: 'center' },
  toastText: { backgroundColor: '#2a1f18dd', color: C.paper, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, fontSize: 14, overflow: 'hidden' },
  panel: { backgroundColor: C.paper, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14, gap: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 0 },
  stat: { flexDirection: 'row', alignItems: 'baseline' },
  statLabel: { color: C.inkSoft, fontSize: 12 },
  statValue: { color: C.ink, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  minor: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paperDeep },
  minorText: { color: C.woodSoft, fontSize: 14 },
  meRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meText: { flex: 1, gap: 2 },
  meName: { fontSize: 18, fontWeight: '700', color: C.ink },
  muted: { color: C.inkSoft, fontSize: 13 },
  timerBox: { alignItems: 'flex-end' },
  timer: { fontSize: 24, fontWeight: '700', color: C.wood, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 8 },
  primary: { flex: 1.3, height: 48, borderRadius: 12, backgroundColor: C.vermilion, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: C.wood },
  primaryText: { color: C.paper, fontSize: 17, fontWeight: '600', letterSpacing: 4 },
  secondaryText: { color: C.gold },
  ghost: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.woodSoft, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: C.wood, fontSize: 16 },
  pressed: { opacity: 0.75 },
  tapped: { backgroundColor: C.gold, transform: [{ scale: 0.94 }] },
});

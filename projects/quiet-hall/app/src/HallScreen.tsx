import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { api, HallError, type HallSnapshot, type Monk, type Session } from './api';
import { EmptyCushion, MonkFigure } from './MonkFigure';
import { C, clock } from './theme';

const POLL_MS = 2000;

export function HallScreen({ session, onLeft }: { session: Session; onLeft: () => void }) {
  const [hall, setHall] = useState<HallSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [tick, setTick] = useState(0);
  const [notice, setNotice] = useState('');
  const [offline, setOffline] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width } = useWindowDimensions();
  const columns = width >= 700 ? 8 : width >= 480 ? 6 : 5;
  const cell = Math.floor(Math.min(width, 900) / columns);

  const say = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 2500);
  }, []);

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

  const me = hall?.me ?? null;
  const drift = me?.sitting ? Math.floor((Date.now() - fetchedAt) / 1000) : 0;   // seconds since the last poll
  void tick;
  const seats = useMemo(() => {
    const bySeat = new Map<number, Monk>();
    for (const m of hall?.monks ?? []) if (m.seat !== null) bySeat.set(m.seat, m);
    return Array.from({ length: hall?.seats ?? 0 }, (_, seat) => ({ seat, monk: bySeat.get(seat) ?? null }));
  }, [hall]);

  if (!hall || !me) {
    return <View style={styles.loading}><Text testID="hall.loading" style={styles.muted}>{offline ? '连不上大殿，正在重试…' : '正在入殿…'}</Text></View>;
  }

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

      <FlatList
        testID="hall.seats" data={seats} key={columns} numColumns={columns} keyExtractor={item => String(item.seat)}
        contentContainerStyle={styles.floor} initialNumToRender={columns * 8} windowSize={7}
        renderItem={({ item }) => {
          const m = item.monk;
          const mine = !!m && m.handle === me.handle;
          const figure = Math.min(cell - 10, 72);
          if (!m) return <View testID={`hall.seat.${item.seat}`} style={[styles.cell, { width: cell }]}><EmptyCushion size={figure} /></View>;
          return (
            <Pressable testID={`hall.monk.${m.handle}`} disabled={mine} style={[styles.cell, { width: cell }]}
              onPress={() => act(() => api.bow(session, m.handle), `向${m.name}合十`)}
              accessibilityRole="button" accessibilityLabel={`${m.name}，${m.sitting ? '静坐中' : '站立'}${mine ? '，这是你' : '，点按合十'}`}>
              <MonkFigure monk={m} size={figure} me={mine} />
              <Text style={[styles.name, mine && styles.nameMe]} numberOfLines={1}>{m.name}</Text>
            </Pressable>
          );
        }}
      />

      {!!notice && <View style={styles.toast} pointerEvents="none"><Text testID="hall.notice" style={styles.toastText}>{notice}</Text></View>}

      <View style={styles.panel}>
        <View style={styles.meRow}>
          <MonkFigure monk={me} size={46} />
          <View style={styles.meText}>
            <View style={styles.inline}>
              <Text testID="hall.me.name" style={styles.meName}>{me.name}</Text><Text testID="hall.me.handle" style={styles.muted}>  @{me.handle}</Text>
            </View>
            <View style={styles.inline}>
              <Text style={styles.muted}>累计 </Text><Text testID="hall.me.total" style={styles.muted}>{clock(me.totalSeconds + drift)}</Text>
              <Text style={styles.muted}> · 受礼 </Text><Text testID="hall.me.bows" style={styles.muted}>{me.bows}</Text>
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
              onPress={() => act(() => api.stand(session), '起身')} accessibilityRole="button" accessibilityLabel="起身">
              <Text style={[styles.primaryText, styles.secondaryText]}>起身</Text>
            </Pressable>
          ) : (
            <Pressable testID="hall.sit" style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              onPress={() => act(() => api.sit(session), '入坐')} accessibilityRole="button" accessibilityLabel="坐下">
              <Text style={styles.primaryText}>坐下</Text>
            </Pressable>
          )}
          <Pressable testID="hall.bow" style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
            onPress={() => act(() => api.bow(session), '向大众合十')} accessibilityRole="button" accessibilityLabel="向大众合十">
            <Text style={styles.ghostText}>合十</Text>
          </Pressable>
          <Pressable testID="hall.leave" style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
            onPress={async () => { try { await api.leave(session); } catch { /* leaving locally is enough */ } onLeft(); }}
            accessibilityRole="button" accessibilityLabel="离寺">
            <Text style={styles.ghostText}>离寺</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.floor },
  loading: { flex: 1, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: C.wood, paddingTop: 14, paddingBottom: 12, paddingHorizontal: 20, alignItems: 'center', gap: 4 },
  title: { color: C.gold, fontSize: 22, fontWeight: '700', letterSpacing: 10 },
  counts: { flexDirection: 'row', gap: 20 },
  inline: { flexDirection: 'row', alignItems: 'baseline' },
  count: { color: '#e9dcc3', fontSize: 14 },
  countNum: { color: '#fff', fontWeight: '700', fontVariant: ['tabular-nums'] },
  offline: { color: '#f2c9a0', fontSize: 12 },
  floor: { paddingVertical: 14, alignItems: 'center' },
  cell: { alignItems: 'center', paddingVertical: 6, minHeight: 44 },
  name: { fontSize: 12, color: C.wood, marginTop: -2 },
  nameMe: { fontWeight: '700', color: C.vermilion },
  toast: { position: 'absolute', left: 0, right: 0, bottom: 176, alignItems: 'center' },
  toastText: { backgroundColor: '#2a1f18dd', color: C.paper, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, fontSize: 14, overflow: 'hidden' },
  panel: { backgroundColor: C.paper, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18, gap: 12 },
  meRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meText: { flex: 1, gap: 2 },
  meName: { fontSize: 18, fontWeight: '700', color: C.ink },
  muted: { color: C.inkSoft, fontSize: 13 },
  timerBox: { alignItems: 'flex-end' },
  timer: { fontSize: 26, fontWeight: '700', color: C.wood, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 10 },
  primary: { flex: 2, height: 48, borderRadius: 12, backgroundColor: C.vermilion, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: C.wood },
  primaryText: { color: C.paper, fontSize: 17, fontWeight: '600', letterSpacing: 4 },
  secondaryText: { color: C.gold },
  ghost: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.woodSoft, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: C.wood, fontSize: 16 },
  pressed: { opacity: 0.75 },
});

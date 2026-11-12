import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, HallError, type HallSnapshot, type Monk, type Session } from './api';
import { Joystick } from './Joystick';
import { BeadsPanel, MALA } from './BeadsPanel';
import { LedgerPanel } from './LedgerPanel';
import { MonkFigure } from './MonkFigure';
import { playBark, playBell, playChime, playKnock, playTick, setChanting, soundStatus, soundSupported, TRACKS } from './sound';
import { useBatched } from './useBatched';
import { HallScene } from './three/HallScene';
import { nearestFreeSeat, resolvePosition, seatPosition } from './three/layout';
import { useOrbit, type Orbit } from './three/orbit';
import type { TrialKind } from './three/Trials';
import { FlatHall } from './FlatHall';
import { Stage3D } from './three/Stage3D';
import { C, clock } from './theme';

const POLL_MS = 2000;
const WALK_SPEED = 2.6;                 // hall units per second, same as the monk's stride
// Trials of composure: a distraction arrives while you sit. Your composure drains; gather your mind to hold it.
const TRIALS: Record<TrialKind, { title: string; drain: number; seconds: number; passed: string }> = {
  dog: { title: '野狗闯进大殿，绕着你狂吠', drain: 13, seconds: 9, passed: '野狗悻悻而去' },
  fairies: { title: '七位仙女飘然而至，绕着你起舞', drain: 17, seconds: 10, passed: '仙女化作一阵清风' },
};
const FOCUS_GAIN = 15;
// Practising during a trial steadies you too; and each practice is worth merit (the hall keeps the same table).
const STEADY = { knock: 8, bead: 6, prostrate: 20 };
const WORTH = { knock: 1, bead: 1, prostrate: 3 };
function trialSetting(): { forced: TrialKind | null; off: boolean } {
  if (Platform.OS !== 'web' || typeof location === 'undefined') return { forced: null, off: false };
  const v = new URLSearchParams(location.search).get('trial');
  return { forced: v === 'dog' || v === 'fairies' ? v : null, off: v === 'off' };
}
interface Trial { kind: TrialKind; focus: number; endsAt: number; at: number }      // `at`: when composure was last updated
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
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [walkTo, setWalkTo] = useState<{ x: number; z: number } | null>(null);        // where I am walking, before the hall confirms
  const rise = useRef(new Animated.Value(0)).current;
  const [riseText, setRiseText] = useState('功德 +1');
  const [trial, setTrial] = useState<Trial | null>(null);
  const [trialsOn, setTrialsOn] = useState(() => !trialSetting().off);
  const [expelled, setExpelled] = useState<(Monk & { lostMerit: number }) | null>(null);       // set when composure runs out: the game is over
  const trialRef = useRef<Trial | null>(null);       // the trial as the timer sees it; `trial` is the copy that is drawn
  const nextTrialAt = useRef(0);
  const lastNoise = useRef(0);
  const stick = useRef({ x: 0, y: 0 });
  const [flat, setFlat] = useState(false);            // true when this device cannot draw the 3D hall
  const noThreeD = useCallback(() => setFlat(true), []);
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

  const gone = useRef(false);                          // once expelled, stop talking to the hall: reading it would walk you back in
  const refresh = useCallback(async () => {
    if (gone.current) return;
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
  const steady = useCallback((by: number) => {            // practising during a trial restores composure
    const t = trialRef.current;
    if (t) { trialRef.current = { ...t, focus: Math.min(100, t.focus + by) }; setTrial(trialRef.current); }
  }, []);
  const knock = useCallback(() => {
    playKnock(); setKnockTick(t => t + 1); float(`功德 +${WORTH.knock}`); knocks.add(); steady(STEADY.knock);
  }, [knocks, float, steady]);
  const prostrate = useCallback(() => {
    playBell(); setBowTick(t => t + 1); bows.add(); steady(STEADY.prostrate);
    const total = (me?.prostrations ?? 0) + bows.extra + 1;
    float(total % MALA === 0 ? `一百零八拜圆满 · 功德 +${WORTH.prostrate}` : `功德 +${WORTH.prostrate}`);
  }, [bows, float, me, steady]);
  const bead = useCallback(() => {
    playTick(); beads.add(); steady(STEADY.bead);
    const total = (me?.beads ?? 0) + beads.extra + 1;
    if (total % MALA === 0) { playBell(); say(`念珠第 ${total / MALA} 圈圆满`); }
  }, [beads, me, say, steady]);

  // Where I am and where everyone else is, for walking without passing through people or pillars.
  const seats = hall?.seats ?? 0;
  const spot = (m: Monk): [number, number] => {
    if (!m.sitting && m.pos) return [m.pos.x, m.pos.z];
    const [x, , z] = seatPosition(m.seat ?? 0, seats); return [x, z];
  };
  const myPos: [number, number] = me ? (walkTo && !me.sitting ? [walkTo.x, walkTo.z] : spot(me)) : [0, 0];
  const others = (hall?.monks ?? []).filter(m => m.handle !== me?.handle && m.seat !== null).map(spot);
  const live = useRef({ me, myPos, others, seats }); live.current = { me, myPos, others, seats };
  const lastSent = useRef(0);
  const sendMove = useCallback((x: number, z: number) => {
    lastSent.current = Date.now();
    api.move(session, x, z).then(res => saved(res.me)).catch(() => { /* the next move or poll will catch up */ });
  }, [session, saved]);

  // Tap the floor to walk there. A seated monk stays seated: stand up first.
  const walk = useCallback((x: number, z: number) => {
    const now = live.current;
    if (!now.me) return;
    if (now.me.sitting) { say('先起身，再走动'); return; }
    const [rx, rz] = resolvePosition(x, z, now.seats, now.others);
    setWalkTo({ x: rx, z: rz });
    sendMove(rx, rz);
  }, [say, sendMove]);
  useEffect(() => { if (me?.sitting) setWalkTo(null); }, [me?.sitting]);

  // The thumb stick walks continuously, relative to where the camera is looking.
  useEffect(() => {
    const step = setInterval(() => {
      const { x, y } = stick.current, now = live.current;
      if ((!x && !y) || !now.me || now.me.sitting) return;
      const yaw = orbit.current.yaw, d = WALK_SPEED * 0.05;
      const dx = (Math.cos(yaw) * x - Math.sin(yaw) * y) * d, dz = (-Math.sin(yaw) * x - Math.cos(yaw) * y) * d;
      const [rx, rz] = resolvePosition(now.myPos[0] + dx, now.myPos[1] + dz, now.seats, now.others);
      setWalkTo({ x: rx, z: rz });
      if (Date.now() - lastSent.current > 600) sendMove(rx, rz);
    }, 50);
    return () => clearInterval(step);
  }, [orbit, sendMove]);
  const stickReleased = useCallback(() => {
    const now = live.current;
    if (now.me && !now.me.sitting) sendMove(now.myPos[0], now.myPos[1]);
  }, [sendMove]);

  // Sit on the free cushion nearest to where you stand; the wooden fish comes with you.
  const sit = useCallback(() => {
    const now = live.current; if (!now.me) return;
    const taken = new Set((hall?.monks ?? []).filter(m => m.handle !== now.me!.handle && m.seat !== null).map(m => m.seat as number));
    const seat = nearestFreeSeat(now.myPos[0], now.myPos[1], now.seats, taken, now.me.seat);
    playBell();
    act(() => api.sit(session, seat), seat !== null && seat !== now.me.seat ? '换到这个蒲团入坐' : '入坐');
  }, [hall, session, act]);

  // Trials of composure, only while seated.
  const sitting = !!me?.sitting;
  useEffect(() => {
    if (!sitting) { trialRef.current = null; setTrial(null); return; }
    const setting = trialSetting();
    nextTrialAt.current = Date.now() + (setting.forced ? 2500 : 14000 + Math.random() * 10000);
    const tickTrial = setInterval(() => {
      const now = Date.now(), t = trialRef.current;
      let next: Trial | null = t;
      if (!t) {
        if (!trialsOn || now < nextTrialAt.current) return;
        const kind: TrialKind = setting.forced ?? (Math.random() < 0.5 ? 'dog' : 'fairies');
        lastNoise.current = 0;
        next = { kind, focus: 100, endsAt: now + TRIALS[kind].seconds * 1000, at: now };
      } else if (now >= t.endsAt && t.focus - TRIALS[t.kind].drain * Math.min(2, (now - t.at) / 1000) > 0) {      // sat through it
        nextTrialAt.current = now + (setting.forced ? 6000 : 35000 + Math.random() * 40000);
        playBell(); float('功德 +10'); say(TRIALS[t.kind].passed);
        api.trial(session, 'held', t.kind).then(res => saved(res.me)).catch(() => { /* the count catches up on the next poll */ });
        next = null;
      } else {
        if (now - lastNoise.current > (t.kind === 'dog' ? 1100 : 2200)) { lastNoise.current = now; (t.kind === 'dog' ? playBark : playChime)(); }
        // drain by the time that really passed, so a slow device does not make the trial easier
        next = { ...t, at: now, focus: Math.max(0, t.focus - TRIALS[t.kind].drain * Math.min(2, (now - t.at) / 1000)) };
      }
      trialRef.current = next; setTrial(next);
    }, 200);
    return () => clearInterval(tickTrial);
  }, [sitting, trialsOn]);                                           // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {                                                   // composure gone: shown out of the temple
    if (trial && trial.focus <= 0 && me && !expelled) {
      gone.current = true;
      const kind = trial.kind;
      const lostMerit = Math.min(20, me.merit);          // merit never goes below zero
      setExpelled({ ...me, merit: me.merit - lostMerit, lostMerit });
      trialRef.current = null; setTrial(null);
      setChanting(null);
      // written down as a loss of merit, then out of the hall
      api.trial(session, 'lost', kind).catch(() => {}).then(() => api.leave(session)).catch(() => { /* the hall lets a silent monk go by itself */ });
    }
  }, [trial, me, expelled, session]);
  // Call a trial on purpose, to test yourself.
  const summon = useCallback((kind: TrialKind) => {
    if (!live.current.me?.sitting) { say('先坐下，再招来考验'); return; }
    if (trialRef.current) return;
    const now = Date.now();
    lastNoise.current = 0;
    trialRef.current = { kind, focus: 100, endsAt: now + TRIALS[kind].seconds * 1000, at: now };
    setTrial(trialRef.current);
  }, [say]);
  const gather = useCallback(() => {
    playTick();
    const t = trialRef.current;
    if (t) { trialRef.current = { ...t, focus: Math.min(100, t.focus + FOCUS_GAIN) }; setTrial(trialRef.current); }
  }, []);

  const drift = me?.sitting ? Math.floor((Date.now() - fetchedAt) / 1000) : 0;   // seconds since the last poll
  void tick;

  if (expelled) {
    return (
      <View style={styles.over} testID="hall.over">
        <Text style={styles.overTitle} accessibilityRole="header">定力不足</Text>
        <Text style={styles.overText}>心随境转，{expelled.name}被请出了山门。</Text>
        <View style={styles.overStats}>
          <Text style={styles.overStat}>静坐 {clock(expelled.totalSeconds)}</Text>
          <Text style={styles.overStat}>守住考验 {expelled.trials} 次</Text>
          <Text testID="hall.over.merit" style={styles.overStat}>{expelled.lostMerit ? `功德 -${expelled.lostMerit}，现有 ${expelled.merit}` : '功德已经是 0，没有可扣的'}</Text>
          <Text style={styles.overStat}>{expelled.registered ? '你的 ID 和功德都还在，随时可以回来。' : '游客身份到此为止。注册一个 ID，功德就能留下。'}</Text>
        </View>
        <Pressable testID="hall.over.again" onPress={onLeft} style={({ pressed }) => [styles.overButton, pressed && styles.pressed]}
          accessibilityRole="button" accessibilityLabel="回到山门，重新入寺">
          <Text style={styles.primaryText}>回到山门</Text>
        </Pressable>
      </View>
    );
  }
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

      <View testID="hall.scene" style={styles.stage} {...(flat ? {} : handlers)}
        {...(Platform.OS === 'web' && !flat ? { onWheel: (e: { deltaY: number }) => zoom(e.deltaY > 0 ? 1.1 : 0.9) } : {})}>
        <Stage3D onFail={noThreeD} style={styles.canvas} dpr={[1, 2]} camera={{ fov: 58, near: 0.1, far: 220, position: [6, 5, 14] }}
          fallback={<FlatHall monks={monks} seats={hall.seats} meHandle={me.handle} onBow={m => act(() => api.bow(session, m.handle), `向${m.name}合十`)} />}>
          <HallScene monks={monks} seats={hall.seats} meHandle={me.handle} orbit={orbit} knockTick={knockTick} onKnock={knock}
            bowTick={bowTick} onFloor={walk} trial={trial?.kind ?? null} onBow={m => act(() => api.bow(session, m.handle), `向${m.name}合十`)} />
        </Stage3D>
        <View style={styles.viewBar} pointerEvents="box-none">
          {soundSupported && TRACKS.length > 0 && (
            <Pressable testID="hall.sound" onPress={nextTrack} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
              accessibilityRole="button" accessibilityLabel={`诵经声，当前${track >= 0 ? TRACKS[track].title : '关闭'}，点按切换`}>
              <Text style={styles.chipText}>诵经 · {track >= 0 ? TRACKS[track].title : '关'}</Text>
            </Pressable>
          )}
          <Pressable testID="hall.trials" onPress={() => setTrialsOn(v => !v)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            accessibilityRole="switch" accessibilityState={{ checked: trialsOn }} accessibilityLabel="定力考验">
            <Text style={styles.chipText}>考验 · {trialsOn ? '开' : '关'}</Text>
          </Pressable>
          {!flat && <Pressable testID="hall.view" onPress={nextView} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            accessibilityRole="button" accessibilityLabel={`切换视角，当前${VIEWS[view].label}`}>
            <Text style={styles.chipText}>视角 · {VIEWS[view].label}</Text>
          </Pressable>}
          {!flat && <Pressable testID="hall.zoom.in" onPress={() => zoom(0.8)} style={({ pressed }) => [styles.chip, styles.chipRound, pressed && styles.pressed]}
            accessibilityRole="button" accessibilityLabel="靠近"><Text style={styles.chipText}>＋</Text></Pressable>}
          {!flat && <Pressable testID="hall.zoom.out" onPress={() => zoom(1.25)} style={({ pressed }) => [styles.chip, styles.chipRound, pressed && styles.pressed]}
            accessibilityRole="button" accessibilityLabel="拉远"><Text style={styles.chipText}>－</Text></Pressable>}
        </View>
        {trial && (
          <View style={styles.trial} pointerEvents="box-none">
            <Text testID="hall.trial" style={styles.trialTitle}>{TRIALS[trial.kind].title}</Text>
            <View style={styles.meter} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(trial.focus) }}>
              <View style={[styles.meterFill, { width: `${trial.focus}%`, backgroundColor: trial.focus > 40 ? C.gold : C.vermilion }]} />
            </View>
            <View style={styles.inline}>
              <Text style={styles.trialNote}>定力 </Text><Text testID="hall.focus.value" style={styles.trialNote}>{Math.round(trial.focus)}</Text>
              <Text style={styles.trialNote}> · 归零会被请出寺庙 · 木鱼、念珠、礼拜也能稳住</Text>
            </View>
            <Pressable testID="hall.focus" onPress={gather} style={({ pressed }) => [styles.focus, pressed && styles.tapped]}
              accessibilityRole="button" accessibilityLabel="收摄心神，稳住定力">
              <Text style={styles.focusText}>收摄心神</Text>
            </Pressable>
          </View>
        )}
        {!flat && !me.sitting && !trial && <Joystick vector={stick} onRelease={stickReleased} />}
        <Animated.Text testID="hall.rise" pointerEvents="none" style={[styles.rise, {
          opacity: rise.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -70] }) }] }]}>
          {riseText}
        </Animated.Text>
        {!!notice && <View style={styles.toast} pointerEvents="none"><Text testID="hall.notice" style={styles.toastText}>{notice}</Text></View>}
        <Text testID="hall.hint" style={[styles.hint, flat && styles.hintFlat]} pointerEvents="none">
          {blocked ? '点一下屏幕，开启诵经声' : flat ? '这台设备不支持 3D，已切换为平面大殿 · 点和尚向他合十' : me.sitting ? '拖动环顾 · 点木鱼敲一下 · 点和尚向他合十' : '用摇杆或点地面走动 · 走到别的蒲团旁可以坐下'}
        </Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.meRow}>
          <MonkFigure monk={me} size={42} />
          <View style={styles.meText}>
            <View style={styles.inline}>
              <Text testID="hall.me.name" style={styles.meName}>{me.name}</Text><Text testID="hall.me.handle" style={styles.muted}>  @{me.handle}</Text>{me.registered && <Text testID="hall.me.registered" style={styles.badge}>已注册</Text>}
            </View>
            <View style={styles.stats}>
              {stat('累计', 'hall.me.total', clock(me.totalSeconds + drift))}
              {stat('功德', 'hall.me.merit', me.merit + knocks.extra * WORTH.knock + bows.extra * WORTH.prostrate + beads.extra * WORTH.bead)}
              {stat('礼拜', 'hall.me.prostrations', me.prostrations + bows.extra)}
              {stat('念珠', 'hall.me.beads', me.beads + beads.extra)}
              {stat('过关', 'hall.me.trials', me.trials)}
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
              onPress={() => { if (trial) { say('考验当前，不可起身'); return; } playBell(); act(() => api.stand(session), '起身，可以在殿内走动'); }}
              accessibilityRole="button" accessibilityLabel="起身">
              <Text style={[styles.primaryText, styles.secondaryText]}>起身</Text>
            </Pressable>
          ) : (
            <Pressable testID="hall.sit" style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              onPress={sit} accessibilityRole="button" accessibilityLabel="在最近的空蒲团坐下">
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
          <Pressable testID="hall.summon.dog" style={({ pressed }) => [styles.minor, pressed && styles.pressed]}
            onPress={() => summon('dog')} accessibilityRole="button" accessibilityLabel="招来野狗，考验定力">
            <Text style={styles.minorText}>唤野狗</Text>
          </Pressable>
          <Pressable testID="hall.summon.fairies" style={({ pressed }) => [styles.minor, pressed && styles.pressed]}
            onPress={() => summon('fairies')} accessibilityRole="button" accessibilityLabel="请来仙女，考验定力">
            <Text style={styles.minorText}>请仙女</Text>
          </Pressable>
          <Pressable testID="hall.ledger" style={({ pressed }) => [styles.minor, pressed && styles.pressed]}
            onPress={() => setLedgerOpen(true)} accessibilityRole="button" accessibilityLabel="查看功德记录">
            <Text style={styles.minorText}>功德记录</Text>
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
        {ledgerOpen && <LedgerPanel session={session} onClose={() => setLedgerOpen(false)} />}
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
  trial: { position: 'absolute', left: 12, right: 12, bottom: 34, alignItems: 'center', gap: 8, backgroundColor: '#2a1f18d9', borderRadius: 16,
           paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#c9a24a88' },
  trialTitle: { color: '#f3ead9', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  trialNote: { color: '#e9dcc3', fontSize: 13 },
  meter: { width: '100%', height: 12, borderRadius: 6, backgroundColor: '#ffffff26', overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 6 },
  focus: { minWidth: 200, height: 52, borderRadius: 26, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  focusText: { color: C.wood, fontSize: 18, fontWeight: '700', letterSpacing: 4 },
  over: { flex: 1, backgroundColor: C.wood, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  overTitle: { color: C.gold, fontSize: 34, fontWeight: '700', letterSpacing: 8 },
  overText: { color: '#f3ead9', fontSize: 17, textAlign: 'center', lineHeight: 26 },
  overStats: { gap: 6, alignItems: 'center', marginVertical: 8 },
  overStat: { color: '#e9dcc3', fontSize: 15 },
  overButton: { width: 220, height: 50, marginTop: 8, borderRadius: 12, backgroundColor: C.vermilion, alignItems: 'center', justifyContent: 'center' },
  hintFlat: { color: C.wood, backgroundColor: '#f3ead9cc', paddingVertical: 4 },
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
  badge: { marginLeft: 6, fontSize: 11, color: C.paper, backgroundColor: C.woodSoft, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  minor: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paperDeep },
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

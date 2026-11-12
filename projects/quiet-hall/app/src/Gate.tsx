import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { playBell, unlockSound } from './sound';
import { FlatTemple } from './FlatHall';
import { Stage3D } from './three/Stage3D';
import { TempleScene } from './three/TempleScene';
import { api, HallError, store, type Session } from './api';
import { C } from './theme';

/** A fresh ID for every visit: nobody has to think of one, and it decides which monk you are. */
function randomId(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz23456789';
  let id = 'm';
  for (let i = 0; i < 9; i += 1) id += letters[Math.floor(Math.random() * letters.length)];
  return id;
}

export function Gate({ initialServer, onEnter }: { initialServer: string; onEnter: (s: Session) => void }) {
  const [server, setServer] = useState(initialServer);
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mine, setMine] = useState(false);            // the "my own ID" form is open
  const [handle, setHandle] = useState('');
  const [needCode, setNeedCode] = useState(false);    // the ID is registered and this device has no key for it
  const [code, setCode] = useState('');
  const [issued, setIssued] = useState<{ code: string; session: Session } | null>(null);     // shown once after registering

  const fail = (e: unknown) => {
    setError(e instanceof HallError ? e.message : '入寺失败，请再试一次');
    if (e instanceof HallError && e.status === 0) setShowServer(true);
  };

  async function guest() {
    if (busy) return;
    unlockSound(); playBell();                     // the tap that enters the temple also allows sound
    setBusy(true); setError('');
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const joined = await api.join(server.trim(), randomId());
          onEnter({ server: server.trim(), handle: joined.me.handle, token: joined.token });
          return;
        } catch (e) {
          if (!(e instanceof HallError && e.status === 409 && attempt < 3)) throw e;    // that ID exists: draw another
        }
      }
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  // My own ID: walk back in if this device knows it, register it if it is new, ask for the return code otherwise.
  async function own() {
    const id = handle.trim(), at = server.trim();
    if (busy || id.length < 2) return;
    unlockSound(); playBell();
    setBusy(true); setError('');
    try {
      if (needCode) {
        const back = await api.login(at, id, code.trim());
        await store.remember(back.me.handle, back.token);
        onEnter({ server: at, handle: back.me.handle, token: back.token, registered: true });
        return;
      }
      const known = (await store.accounts())[id.toLowerCase()];
      if (known) {
        try {
          const back = await api.join(at, id, known);
          onEnter({ server: at, handle: back.me.handle, token: back.token, registered: true });
          return;
        } catch (e) {
          if (!(e instanceof HallError && e.status === 409)) throw e;
          await store.forget(id);                    // the key was replaced from another device
        }
      }
      try {
        const reg = await api.register(at, id);
        await store.remember(reg.me.handle, reg.token);
        setIssued({ code: reg.code, session: { server: at, handle: reg.me.handle, token: reg.token, registered: true } });
      } catch (e) {
        if (e instanceof HallError && e.status === 409) { setNeedCode(true); setError('这个 ID 已注册。是你的话，请输入回寺口令'); return; }
        throw e;
      }
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.scene} pointerEvents="none">
        <Stage3D fallback={<FlatTemple />} style={styles.canvas} dpr={[1, 2]} camera={{ fov: 50, near: 0.1, far: 260, position: [0, 4.3, 27] }}>
          <TempleScene />
        </Stage3D>
      </View>
      <View style={styles.card}>
        <Text style={styles.title} accessibilityRole="header">静堂</Text>
        {issued ? (
          <>
            <Text style={styles.sub}>注册好了。这是你的回寺口令，只显示这一次：</Text>
            <Text testID="gate.code" style={styles.code} selectable>{issued.code}</Text>
            <Text style={styles.credit}>在这台设备上，下次直接输入 ID 就能回来。换手机或清除浏览器数据后，需要这个口令才能找回你的功德。请截图或抄下来。</Text>
            <Pressable testID="gate.code.done" onPress={() => onEnter(issued.session)} accessibilityRole="button" accessibilityLabel="记好了，入寺"
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>记好了，入寺</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.sub}>入寺后你会成为一位小和尚，在大殿里安静地坐一会儿。</Text>
            {!!error && <Text testID="gate.error" style={styles.error} accessibilityRole="alert">{error}</Text>}
            {mine ? (
              <>
                <TextInput testID="gate.handle" style={styles.input} value={handle} onChangeText={t => { setHandle(t); setNeedCode(false); setError(''); }}
                  placeholder="你的 ID（2–16 位）" placeholderTextColor={C.inkSoft} autoCapitalize="none" autoCorrect={false} maxLength={16}
                  returnKeyType="go" onSubmitEditing={own} accessibilityLabel="你的 ID" />
                {needCode && (
                  <TextInput testID="gate.code.input" style={styles.input} value={code} onChangeText={setCode} placeholder="回寺口令，如 A1B2C-3D4E5"
                    placeholderTextColor={C.inkSoft} autoCapitalize="characters" autoCorrect={false} maxLength={12} returnKeyType="go" onSubmitEditing={own}
                    accessibilityLabel="回寺口令" />
                )}
                <Pressable testID="gate.own" onPress={own} disabled={busy || handle.trim().length < 2} accessibilityRole="button"
                  accessibilityLabel={needCode ? '用口令回寺' : '注册或回寺'} accessibilityState={{ disabled: busy || handle.trim().length < 2 }}
                  style={({ pressed }) => [styles.button, (busy || handle.trim().length < 2) && styles.buttonOff, pressed && styles.pressed]}>
                  {busy ? <ActivityIndicator color={C.paper} /> : <Text style={styles.buttonText}>{needCode ? '回寺' : '注册 / 回寺'}</Text>}
                </Pressable>
                <Pressable testID="gate.mine.close" onPress={() => { setMine(false); setError(''); setNeedCode(false); }} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.link}>不注册，以游客入寺</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable testID="gate.enter" onPress={guest} disabled={busy} accessibilityRole="button" accessibilityLabel="以游客入寺"
                  accessibilityState={{ disabled: busy }} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                  {busy ? <ActivityIndicator color={C.paper} /> : <Text style={styles.buttonText}>入寺</Text>}
                </Pressable>
                <Pressable testID="gate.mine" onPress={() => { setMine(true); setError(''); }} accessibilityRole="button"
                  accessibilityLabel="用我的 ID 入寺，保留功德" style={({ pressed }) => [styles.second, pressed && styles.pressed]}>
                  <Text style={styles.secondText}>用我的 ID 入寺（保留功德）</Text>
                </Pressable>
              </>
            )}
          </>
        )}
        <Pressable testID="gate.server.toggle" onPress={() => setShowServer(v => !v)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.link}>{showServer ? '收起服务器地址' : '服务器地址'}</Text>
        </Pressable>
        {showServer && (
          <TextInput testID="gate.server" style={[styles.input, styles.inputSmall]} value={server} onChangeText={setServer}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel="服务器地址" />
        )}
        <Text style={styles.credit}>本站会记录入寺和功能使用情况用于统计，不记录 IP 地址。诵经录音来自 Wikimedia Commons：灵隐寺僧众诵经（LouiseBrown1981，CC BY-SA 3.0）、心经（Nyarlathotep1001，CC0）</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1d9b0', alignItems: 'center', justifyContent: 'flex-end' },
  scene: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  canvas: { flex: 1 },
  card: { width: '100%', maxWidth: 460, alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28,
          backgroundColor: '#f3ead9ee', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  title: { fontSize: 34, fontWeight: '700', color: C.wood, letterSpacing: 8 },
  sub: { fontSize: 15, color: C.inkSoft, textAlign: 'center', lineHeight: 22 },
  input: { width: '100%', height: 50, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#fffaf0',
           paddingHorizontal: 16, fontSize: 17, color: C.ink },
  inputSmall: { height: 42, fontSize: 14 },
  error: { color: C.vermilion, fontSize: 14, textAlign: 'center' },
  button: { width: '100%', height: 50, borderRadius: 12, backgroundColor: C.vermilion, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  buttonOff: { opacity: 0.45 },
  second: { width: '100%', height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.woodSoft, alignItems: 'center', justifyContent: 'center' },
  secondText: { color: C.wood, fontSize: 15 },
  code: { fontSize: 30, fontWeight: '700', color: C.vermilion, letterSpacing: 3, fontVariant: ['tabular-nums'] },
  buttonText: { color: C.paper, fontSize: 18, fontWeight: '600', letterSpacing: 4 },
  credit: { color: C.inkSoft, fontSize: 11, textAlign: 'center', lineHeight: 16 },
  link: { color: C.inkSoft, fontSize: 13, textDecorationLine: 'underline' },
});

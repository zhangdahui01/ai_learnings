import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { playBell, unlockSound } from './sound';
import { FlatTemple } from './FlatHall';
import { Stage3D } from './three/Stage3D';
import { TempleScene } from './three/TempleScene';
import { api, HallError, type Session } from './api';
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

  async function enter() {
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
    } catch (e) {
      setError(e instanceof HallError ? e.message : '入寺失败，请再试一次');
      if (e instanceof HallError && e.status === 0) setShowServer(true);
    } finally {
      setBusy(false);
    }
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
        <Text style={styles.sub}>入寺后你会成为一位小和尚，在大殿里安静地坐一会儿。</Text>
        {!!error && <Text testID="gate.error" style={styles.error} accessibilityRole="alert">{error}</Text>}
        <Pressable testID="gate.enter" onPress={enter} disabled={busy} accessibilityRole="button" accessibilityLabel="入寺"
          accessibilityState={{ disabled: busy }} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator color={C.paper} /> : <Text style={styles.buttonText}>入寺</Text>}
        </Pressable>
        <Pressable testID="gate.server.toggle" onPress={() => setShowServer(v => !v)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.link}>{showServer ? '收起服务器地址' : '服务器地址'}</Text>
        </Pressable>
        <Text style={styles.credit}>诵经录音来自 Wikimedia Commons：灵隐寺僧众诵经（LouiseBrown1981，CC BY-SA 3.0）、心经（Nyarlathotep1001，CC0）</Text>
        {showServer && (
          <TextInput testID="gate.server" style={[styles.input, styles.inputSmall]} value={server} onChangeText={setServer}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel="服务器地址" />
        )}
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
  buttonText: { color: C.paper, fontSize: 18, fontWeight: '600', letterSpacing: 4 },
  credit: { color: C.inkSoft, fontSize: 11, textAlign: 'center', lineHeight: 16 },
  link: { color: C.inkSoft, fontSize: 13, textDecorationLine: 'underline' },
});

import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { api, HallError, type Session } from './api';
import { C } from './theme';

function TempleGate() {
  return (
    <Svg width={220} height={130} viewBox="0 0 220 130">
      <Path d="M10 46 Q110 8 210 46 L196 54 Q110 28 24 54 Z" fill={C.wood} />
      <Path d="M30 62 Q110 40 190 62 L180 69 Q110 52 40 69 Z" fill={C.woodSoft} />
      <Rect x={52} y={68} width={12} height={58} fill={C.vermilion} />
      <Rect x={156} y={68} width={12} height={58} fill={C.vermilion} />
      <Rect x={84} y={74} width={52} height={20} rx={3} fill={C.wood} />
      <Rect x={40} y={124} width={140} height={5} fill={C.woodSoft} />
    </Svg>
  );
}

export function Gate({ initialServer, onEnter }: { initialServer: string; onEnter: (s: Session) => void }) {
  const [handle, setHandle] = useState('');
  const [server, setServer] = useState(initialServer);
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = handle.trim().length >= 2 && !busy;

  async function enter() {
    if (!ready) return;
    setBusy(true); setError('');
    try {
      const name = handle.trim();
      const joined = await api.join(server.trim(), name);
      onEnter({ server: server.trim(), handle: joined.me.handle, token: joined.token });
    } catch (e) {
      setError(e instanceof HallError ? e.message : '入寺失败，请再试一次');
      if (e instanceof HallError && e.status === 0) setShowServer(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <TempleGate />
        <Text style={styles.title} accessibilityRole="header">静堂</Text>
        <Text style={styles.sub}>取一个 ID，入寺，在大殿里安静地坐一会儿。</Text>
        <TextInput
          testID="gate.handle" style={styles.input} value={handle} onChangeText={setHandle}
          placeholder="修行 ID（2–16 位）" placeholderTextColor={C.inkSoft} autoCapitalize="none" autoCorrect={false}
          maxLength={16} returnKeyType="go" onSubmitEditing={enter} accessibilityLabel="修行 ID" />
        {!!error && <Text testID="gate.error" style={styles.error} accessibilityRole="alert">{error}</Text>}
        <Pressable testID="gate.enter" onPress={enter} disabled={!ready} accessibilityRole="button" accessibilityLabel="入寺"
          accessibilityState={{ disabled: !ready }} style={({ pressed }) => [styles.button, !ready && styles.buttonOff, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator color={C.paper} /> : <Text style={styles.buttonText}>入寺</Text>}
        </Pressable>
        <Pressable testID="gate.server.toggle" onPress={() => setShowServer(v => !v)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.link}>{showServer ? '收起服务器地址' : '服务器地址'}</Text>
        </Pressable>
        {showServer && (
          <TextInput testID="gate.server" style={[styles.input, styles.inputSmall]} value={server} onChangeText={setServer}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel="服务器地址" />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, alignItems: 'center', gap: 14 },
  title: { fontSize: 40, fontWeight: '700', color: C.wood, letterSpacing: 8 },
  sub: { fontSize: 15, color: C.inkSoft, textAlign: 'center', lineHeight: 22 },
  input: { width: '100%', height: 50, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#fffaf0',
           paddingHorizontal: 16, fontSize: 17, color: C.ink },
  inputSmall: { height: 42, fontSize: 14 },
  error: { color: C.vermilion, fontSize: 14, textAlign: 'center' },
  button: { width: '100%', height: 50, borderRadius: 12, backgroundColor: C.vermilion, alignItems: 'center', justifyContent: 'center' },
  buttonOff: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  buttonText: { color: C.paper, fontSize: 18, fontWeight: '600', letterSpacing: 4 },
  link: { color: C.inkSoft, fontSize: 13, textDecorationLine: 'underline' },
});

import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api, defaultServer, HallError, store, type Session } from './src/api';
import { Gate } from './src/Gate';
import { HallScreen } from './src/HallScreen';
import { C } from './src/theme';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [server, setServer] = useState(defaultServer());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await store.load();
      if (saved) {
        setServer(saved.server);
        try {                                    // walk back in as the same monk
          const joined = await api.join(saved.server, saved.handle, saved.token);
          setSession({ ...saved, token: joined.token, registered: joined.me.registered });
        } catch (e) {
          // Only the hall saying "this ID is not yours" ends the identity. A failed request (bad signal, a busy
          // phone) must not: go in anyway and let the hall screen keep trying.
          if (e instanceof HallError && (e.status === 409 || e.status === 400)) await store.clear();
          else setSession(saved);
        }
      }
      setReady(true);
    })();
  }, []);

  const enter = useCallback((s: Session) => { setSession(s); setServer(s.server); store.save(s); }, []);
  const left = useCallback(() => { setSession(null); store.clear(); }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, session && styles.hall]} edges={['top', 'bottom']}>
        <StatusBar style={session ? 'light' : 'dark'} />
        {!ready ? <View style={styles.root} /> : session
          ? <HallScreen session={session} onLeft={left} />
          : <Gate initialServer={server} onEnter={enter} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.paper }, hall: { backgroundColor: C.wood } });

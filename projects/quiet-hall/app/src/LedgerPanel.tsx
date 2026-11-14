import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, type MeritChange, type Session } from './api';
import { C } from './theme';

const two = (n: number) => String(n).padStart(2, '0');
function when(at: number): string {
  const d = new Date(at);
  return `${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/** The merit record: every gain and loss with its time, its reason and the total afterwards. */
export function LedgerPanel({ session, onClose }: { session: Session; onClose: () => void }) {
  const [rows, setRows] = useState<MeritChange[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api.history(session).then(r => { if (live) setRows(r.history); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [session]);
  return (
    <View style={styles.sheet} testID="ledger.panel">
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">功德记录</Text>
        <Pressable testID="ledger.close" onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="收起功德记录" style={styles.close}>
          <Text style={styles.closeText}>收起</Text>
        </Pressable>
      </View>
      {failed ? <Text style={styles.empty}>没取到记录，请稍后再试</Text>
        : rows === null ? <Text style={styles.empty}>正在翻功德簿…</Text>
        : rows.length === 0 ? <Text testID="ledger.empty" style={styles.empty}>还没有记录。敲木鱼、礼拜、拨念珠、守住考验都会记功德。</Text>
        : (
          <FlatList data={rows} keyExtractor={(r, i) => `${r.at}-${i}`} style={styles.list}
            renderItem={({ item, index }) => (
              <View style={styles.row} testID={`ledger.row.${index}`}>
                <View style={styles.what}>
                  <Text testID={`ledger.reason.${index}`} style={styles.reason}>{item.reason}</Text>
                  <Text style={styles.at}>{when(item.at)}</Text>
                </View>
                <Text testID={`ledger.delta.${index}`} style={[styles.delta, { color: item.delta < 0 ? C.vermilion : '#2f6b3d' }]}>
                  {item.delta > 0 ? `+${item.delta}` : String(item.delta)}
                </Text>
                <Text testID={`ledger.total.${index}`} style={styles.total}>{item.total}</Text>
              </View>
            )}
            ListHeaderComponent={<View style={styles.row}><Text style={[styles.what, styles.th]}>原因 · 时间</Text><Text style={[styles.delta, styles.th]}>增减</Text><Text style={[styles.total, styles.th]}>功德</Text></View>}
          />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: 420, backgroundColor: '#f3ead9', borderTopWidth: 1, borderColor: '#cdbb9c',
           borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 12, paddingBottom: 14 },
  head: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '700', color: C.wood, letterSpacing: 4 },
  close: { position: 'absolute', right: 16, height: 44, justifyContent: 'center' },
  closeText: { color: C.inkSoft, fontSize: 14 },
  list: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#e1d6bf', gap: 8 },
  what: { flex: 1 },
  reason: { fontSize: 15, color: C.ink },
  at: { fontSize: 12, color: C.inkSoft, fontVariant: ['tabular-nums'] },
  delta: { width: 56, textAlign: 'right', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  total: { width: 56, textAlign: 'right', fontSize: 14, color: C.inkSoft, fontVariant: ['tabular-nums'] },
  th: { fontSize: 12, color: C.inkSoft, fontWeight: '400' },
  empty: { textAlign: 'center', color: C.inkSoft, fontSize: 14, padding: 24, lineHeight: 22 },
});

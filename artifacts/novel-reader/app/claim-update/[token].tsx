import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SubscreenHeader } from '@/components/SubscreenHeader';
import { useColors } from '@/hooks/useColors';
import { fetchClaimDetail, submitFollowup, type ClaimDetailToken } from '@/utils/tip-claims';

export default function ClaimUpdateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  const key = Array.isArray(token) ? token[0] ?? '' : token ?? '';
  const [detail, setDetail] = useState<ClaimDetailToken | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [evidenceUris, setEvidenceUris] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!key) {
      setFailed(true);
      return;
    }
    void fetchClaimDetail(key).then(setDetail).catch(() => setFailed(true));
  }, [key]);

  const pickEvidence = async () => {
    if (evidenceUris.length >= 10) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (!result.canceled) {
        const uri = result.assets[0]?.uri;
        if (uri) {
          setEvidenceUris((current) => (current.length >= 10 ? current : [...current, uri]));
          setError(null);
        }
      }
    } catch {
      setError('The photo library could not be opened. Try again.');
    }
  };

  const handleSend = async () => {
    if (!message.trim() && evidenceUris.length === 0) {
      setError('Write a reply or attach screenshots.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const evidence = [];
      let payloadBytes = 0;
      for (const [index, uri] of evidenceUris.entries()) {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        payloadBytes += base64.length;
        if (payloadBytes > 4_000_000) {
          setError('Those screenshots are too large together. Remove a few and try again.');
          setBusy(false);
          return;
        }
        evidence.push({ name: `followup-${index + 1}.jpg`, dataUrl: `data:image/jpeg;base64,${base64}` });
      }
      await submitFollowup(key, { message: message.trim(), evidence });
      setMessage('');
      setEvidenceUris([]);
      setSent(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The reply could not be sent. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SubscreenHeader eyebrow="Authors" title="More details" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}>
        <View style={styles.content}>
          {!detail && !failed ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : failed || !detail ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Link no longer works</Text>
              <Text style={[styles.note, { color: colors.mutedForeground }]}>
                This follow-up link is invalid. Ask for a new one if the review is still open.
              </Text>
            </View>
          ) : sent ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.statusRow}>
                <Feather name="check-circle" size={16} color={colors.primary} />
                <Text style={[styles.statusText, { color: colors.foreground }]}>
                  Reply sent. It lands straight back on your claim.
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>A few more questions</Text>
              <Text style={[styles.note, { color: colors.mutedForeground }]}>
                Review of your claim for {detail.authorName} needs a little more before it can pass.
              </Text>
              {detail.questions.map((question) => (
                <View key={question.id} style={styles.question}>
                  <Feather name="help-circle" size={14} color={colors.primary} />
                  <Text style={[styles.questionText, { color: colors.foreground }]}>{question.text}</Text>
                </View>
              ))}
              <TextInput
                accessibilityLabel="Your reply"
                multiline
                onChangeText={(value) => {
                  setMessage(value);
                  setError(null);
                }}
                placeholder="Answer here"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.messageInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                textAlignVertical="top"
                value={message}
              />
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SCREENSHOTS · {evidenceUris.length}/10</Text>
              <View style={styles.evidenceGrid}>
                {evidenceUris.map((uri) => (
                  <View key={uri} style={styles.evidenceCell}>
                    <Image accessibilityLabel="Follow-up evidence" source={{ uri }} style={styles.evidenceThumb} />
                    <Pressable
                      accessibilityLabel="Remove screenshot"
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => setEvidenceUris((current) => current.filter((item) => item !== uri))}
                      style={[styles.evidenceRemove, { backgroundColor: colors.background, borderColor: colors.border }]}
                    >
                      <Feather name="x" size={12} color={colors.foreground} />
                    </Pressable>
                  </View>
                ))}
                {evidenceUris.length < 10 ? (
                  <Pressable
                    accessibilityLabel="Attach screenshots"
                    accessibilityRole="button"
                    onPress={() => void pickEvidence()}
                    style={[styles.evidenceAdd, { borderColor: colors.border, backgroundColor: colors.background }]}
                  >
                    <Feather name="plus" size={18} color={colors.primary} />
                    <Text style={[styles.evidenceAddText, { color: colors.mutedForeground }]}>Add</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void handleSend()}
                style={[styles.action, { backgroundColor: colors.primary, opacity: busy ? 0.55 : 1 }]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Send reply</Text>
                )}
              </Pressable>
              {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 22, gap: 14 },
  card: { borderWidth: 1, borderRadius: 18, padding: 18 },
  cardTitle: { fontFamily: 'Georgia', fontSize: 20, lineHeight: 25 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 8 },
  error: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 10 },
  loader: { marginTop: 40 },
  question: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 },
  questionText: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, flex: 1 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, marginTop: 12, fontFamily: 'Inter_500Medium', fontSize: 13 },
  messageInput: { minHeight: 76, paddingTop: 12, paddingBottom: 12, fontSize: 12, lineHeight: 18 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.2, marginTop: 14 },
  action: { minHeight: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  evidenceCell: { position: 'relative' },
  evidenceThumb: { width: 64, height: 64, borderRadius: 12 },
  evidenceRemove: { position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  evidenceAdd: { width: 64, height: 64, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  evidenceAddText: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  statusText: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, flex: 1 },
});

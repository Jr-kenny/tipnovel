import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useState } from 'react';
import Animated, { FadeIn, FadeOut, SlideInUp, SlideOutDown } from 'react-native-reanimated';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatUnits, parseUnits } from 'viem';
import type { ReaderPalette } from '@/utils/reader-style';
import {
  TIP_PRESETS,
  USDC_DECIMALS,
  explorerTxUrl,
  shortAddress,
} from '@/utils/tip-chain';
import {
  TipError,
  connectWallet,
  ensureArcNetwork,
  getPairingUri,
  getWalletSession,
  readAuthorStats,
  readUsdcBalance,
  restoreWalletSession,
  sendTip,
  subscribePairingUri,
  subscribeWalletSession,
  type AuthorStats,
  type WalletSession,
} from '@/utils/tip-wallet';

function errorLine(error: unknown): string {
  if (error instanceof TipError) return error.message;
  return 'Something went wrong. Try again.';
}

function AmountChip({
  label,
  selected,
  onPress,
  palette,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  palette: ReaderPalette;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? palette.accent : palette.surface, borderColor: selected ? palette.accent : palette.border },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? palette.background : palette.text }]}>{label}</Text>
    </Pressable>
  );
}

export function TipSheet({
  bookTitle,
  authorName,
  authorId,
  palette,
  onClose,
}: {
  bookTitle: string;
  authorName: string;
  authorId: `0x${string}`;
  palette: ReaderPalette;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<AuthorStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [session, setSession] = useState<WalletSession | null>(() => getWalletSession());
  const [pairingUri, setPairingUri] = useState<string | null>(() => getPairingUri());
  const [preset, setPreset] = useState<number | null>(1);
  const [customAmount, setCustomAmount] = useState('');
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [finalTippers, setFinalTippers] = useState<bigint | null>(null);

  const amountText = preset !== null ? String(TIP_PRESETS[preset]) : customAmount;

  const loadStats = useCallback(async () => {
    try {
      setStats(await readAuthorStats(authorId));
      setStatsFailed(false);
    } catch {
      setStatsFailed(true);
    }
  }, [authorId]);

  useEffect(() => {
    void loadStats();
    void restoreWalletSession().catch(() => {});
    const stopSession = subscribeWalletSession(() => setSession(getWalletSession()));
    const stopPairing = subscribePairingUri(() => setPairingUri(getPairingUri()));
    return () => {
      stopSession();
      stopPairing();
    };
  }, [loadStats]);

  useEffect(() => {
    if (!session) {
      setBalance(null);
      return;
    }
    void readUsdcBalance(session.address).then(setBalance).catch(() => setBalance(null));
  }, [session]);

  const parsedAmount = (() => {
    try {
      const value = parseUnits(amountText.trim(), USDC_DECIMALS);
      return value > 0n ? value : null;
    } catch {
      return null;
    }
  })();

  const handleConnect = async () => {
    setBusy(true);
    setBusyLabel('Waiting for the wallet…');
    setFailure(null);
    try {
      await connectWallet();
      await ensureArcNetwork();
      setFailure(null);
    } catch (error) {
      setFailure(errorLine(error));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleSwitchNetwork = async () => {
    setBusy(true);
    setBusyLabel('Switching to Arc…');
    setFailure(null);
    try {
      await ensureArcNetwork();
    } catch (error) {
      setFailure(errorLine(error));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleSend = async () => {
    if (!parsedAmount || !session) return;
    setBusy(true);
    setBusyLabel('Confirm in wallet…');
    setFailure(null);
    try {
      const hash = await sendTip(authorId, parsedAmount, bookTitle, (stage) => {
        setBusyLabel(stage === 'approve' ? 'Confirm approval (1 of 2)…' : 'Confirm tip (2 of 2)…');
      });
      const fresh = await readAuthorStats(authorId);
      setStats(fresh);
      setFinalTippers(fresh.tippers);
      setBalance(await readUsdcBalance(session.address).catch(() => null));
      setTxHash(hash);
    } catch (error) {
      setFailure(errorLine(error));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const copyPairingUri = async () => {
    if (pairingUri) await Clipboard.setStringAsync(pairingUri);
  };

  const tippers = finalTippers ?? stats?.tippers ?? null;

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.overlay} testID="tip-sheet">
      <Pressable accessibilityLabel="Close tip sheet" onPress={onClose} style={styles.scrim} />
      <Animated.View
        entering={SlideInUp.duration(240)}
        exiting={SlideOutDown.duration(180)}
        style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: palette.text }]}>Tip the author</Text>
            <Text style={[styles.subtitle, { color: palette.muted }]} numberOfLines={1}>{bookTitle}</Text>
          </View>
          <Pressable accessibilityLabel="Close tip sheet" accessibilityRole="button" hitSlop={10} onPress={onClose}>
            <Feather name="x" size={20} color={palette.text} />
          </Pressable>
        </View>

        {txHash ? (
          <View style={styles.body}>
            <View style={styles.successRow}>
              <Feather name="check-circle" size={20} color={palette.accent} />
              <Text style={[styles.successText, { color: palette.text }]}>
                Sent {amountText} USDC to {authorName}
              </Text>
            </View>
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(explorerTxUrl(txHash))}
              style={[styles.linkRow, { borderColor: palette.border }]}
            >
              <Text style={[styles.linkText, { color: palette.text }]}>View on the Arc explorer</Text>
              <Feather name="external-link" size={14} color={palette.accent} />
            </Pressable>
            {tippers !== null ? (
              <Text style={[styles.meta, { color: palette.muted }]}>{tippers.toString()} tipped this author</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.primaryButton, { backgroundColor: palette.accent }]}
            >
              <Text style={[styles.primaryButtonText, { color: palette.background }]}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.body}>
            <Text style={[styles.author, { color: palette.text }]}>{authorName}</Text>
            {stats ? (
              <Text style={[styles.meta, { color: palette.muted }]}>
                {stats.tippers.toString()} tipped this author
                {stats.verified ? ' · Verified author' : ' · Not claimed yet. Tips are held safely until the author is verified.'}
              </Text>
            ) : statsFailed ? (
              <Text style={[styles.meta, { color: palette.muted }]}>Author totals are unavailable right now.</Text>
            ) : (
              <ActivityIndicator color={palette.accent} style={styles.loader} />
            )}

            <View style={styles.chips}>
              {TIP_PRESETS.map((value, index) => (
                <AmountChip
                  key={value}
                  label={`${value} USDC`}
                  onPress={() => {
                    setPreset(index);
                    setCustomAmount('');
                    setFailure(null);
                  }}
                  palette={palette}
                  selected={preset === index}
                />
              ))}
            </View>
            <TextInput
              accessibilityLabel="Custom tip amount in USDC"
              keyboardType="decimal-pad"
              onChangeText={(value) => {
                setCustomAmount(value);
                setPreset(null);
                setFailure(null);
              }}
              placeholder="Custom amount"
              placeholderTextColor={palette.muted}
              style={[styles.input, { backgroundColor: palette.background, borderColor: palette.border, color: palette.text }]}
              value={customAmount}
            />

            {!stats || stats.deployed === false ? (
              <Text style={[styles.meta, { color: palette.muted }]}>Tipping is not live yet. Check back soon.</Text>
            ) : !session ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void handleConnect()}
                style={[styles.primaryButton, { backgroundColor: palette.accent, opacity: busy ? 0.6 : 1 }]}
              >
                {busy ? (
                  <ActivityIndicator color={palette.background} />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: palette.background }]}>Connect wallet</Text>
                )}
              </Pressable>
            ) : (
              <View>
                <View style={styles.sessionRow}>
                  <Text style={[styles.sessionText, { color: palette.muted }]}>{shortAddress(session.address)}</Text>
                  <Text style={[styles.sessionText, { color: palette.muted }]}>
                    {formatUnits(balance ?? 0n, USDC_DECIMALS)} USDC
                  </Text>
                </View>
                {pairingUri && Platform.OS !== 'web' ? (
                  <View style={[styles.pairBox, { borderColor: palette.border }]}>
                    <Text style={[styles.meta, { color: palette.muted }]} numberOfLines={1}>{pairingUri}</Text>
                    <View style={styles.pairActions}>
                      <Pressable accessibilityRole="button" onPress={() => void copyPairingUri()} style={styles.pairAction}>
                        <Text style={[styles.pairActionText, { color: palette.text }]}>Copy code</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(pairingUri)} style={styles.pairAction}>
                        <Text style={[styles.pairActionText, { color: palette.text }]}>Open wallet</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || !parsedAmount}
                  onPress={() => void handleSend()}
                  style={[styles.primaryButton, { backgroundColor: palette.accent, opacity: busy || !parsedAmount ? 0.55 : 1 }]}
                >
                  {busy ? (
                    <Text style={[styles.primaryButtonText, { color: palette.background }]}>{busyLabel}</Text>
                  ) : (
                    <Text style={[styles.primaryButtonText, { color: palette.background }]}>
                      {parsedAmount ? `Send ${amountText} USDC` : 'Enter an amount'}
                    </Text>
                  )}
                </Pressable>
                {balance !== null && parsedAmount !== null && balance < parsedAmount ? (
                  <View style={styles.lowBalance}>
                    <Text style={[styles.meta, { color: palette.muted }]}>Not enough USDC for this tip.</Text>
                    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://docs.arc.io')}>
                      <Text style={[styles.howLink, { color: palette.text }]}>How to get USDC</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )}

            {failure ? (
              <View style={styles.failureRow}>
                <Text style={[styles.failureText, { color: palette.text }]}>{failure}</Text>
                {/Arc|network/i.test(failure) ? (
                  <Pressable accessibilityRole="button" disabled={busy} onPress={() => void handleSwitchNetwork()}>
                    <Text style={[styles.howLink, { color: palette.text }]}>Switch to Arc</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 30, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.28)' },
  panel: { borderTopWidth: 1, borderTopLeftRadius: 17, borderTopRightRadius: 17, paddingBottom: 26, maxHeight: '86%' },
  header: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerCopy: { flex: 1 },
  title: { fontFamily: 'Georgia', fontSize: 20 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  body: { paddingHorizontal: 18 },
  author: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 6 },
  loader: { marginTop: 10, alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', gap: 8, marginTop: 14 },
  chip: { flex: 1, minHeight: 38, borderWidth: 1, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, marginTop: 10, fontFamily: 'Inter_500Medium', fontSize: 13 },
  sessionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  sessionText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  primaryButton: { minHeight: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingHorizontal: 18 },
  primaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  pairBox: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 12 },
  pairActions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  pairAction: { paddingVertical: 4 },
  pairActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  lowBalance: { marginTop: 10 },
  howLink: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 4, textDecorationLine: 'underline' },
  failureRow: { marginTop: 12 },
  failureText: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  successText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, flex: 1, lineHeight: 20 },
  linkRow: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
});

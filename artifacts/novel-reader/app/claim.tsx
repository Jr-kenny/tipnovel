import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatUnits, isAddress, type Address } from 'viem';
import { SubscreenHeader } from '@/components/SubscreenHeader';
import { useColors } from '@/hooks/useColors';
import {
  OWNER_ADDRESS,
  USDC_DECIMALS,
  authorIdFor,
  explorerTxUrl,
  usableAuthorName,
} from '@/utils/tip-chain';
import {
  TipError,
  connectWallet,
  ensureArcNetwork,
  getWalletSession,
  readAuthorStats,
  restoreWalletSession,
  subscribeWalletSession,
  verifyAuthor,
  withdrawTips,
  type AuthorStats,
  type WalletSession,
} from '@/utils/tip-wallet';
import { loadClaims, markClaimApproved, saveClaim, type ClaimRequest } from '@/utils/tip-claims';

function plainError(error: unknown): string {
  if (error instanceof TipError) return error.message;
  return 'Something went wrong. Try again.';
}

function usdcToUsd(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '0.00';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ClaimScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [authorName, setAuthorName] = useState('');
  const [stats, setStats] = useState<AuthorStats | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [originPlatform, setOriginPlatform] = useState('');
  const [originUsername, setOriginUsername] = useState('');
  const [originUrl, setOriginUrl] = useState('');
  const [evidenceUris, setEvidenceUris] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [payoutWallet, setPayoutWallet] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [claims, setClaims] = useState<ClaimRequest[]>([]);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [connected, setConnected] = useState<WalletSession | null>(() => getWalletSession());
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawTx, setWithdrawTx] = useState<string | null>(null);

  const refreshClaims = useCallback(async () => {
    setClaims(await loadClaims());
  }, []);

  useEffect(() => {
    void refreshClaims();
    void restoreWalletSession().catch(() => {});
    return subscribeWalletSession(() => setConnected(getWalletSession()));
  }, [refreshClaims]);

  const checkedName = usableAuthorName(authorName);
  const checkedAuthorId = checkedName ? authorIdFor(checkedName) : null;

  const handleLookup = async () => {
    if (!checkedAuthorId) return;
    setLookupBusy(true);
    setLookupFailed(false);
    setStats(null);
    setSubmitted(false);
    try {
      setStats(await readAuthorStats(checkedAuthorId));
    } catch {
      setLookupFailed(true);
    } finally {
      setLookupBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!checkedName || !checkedAuthorId || !stats) return;
    if (!originPlatform.trim()) {
      setSubmitError('Name the place the novel was first uploaded.');
      return;
    }
    if (!originUsername.trim()) {
      setSubmitError('Add your username on that platform.');
      return;
    }
    if (!evidenceUris.length) {
      setSubmitError('Attach at least one dashboard screenshot showing the title, date, and username.');
      return;
    }
    if (!isAddress(payoutWallet.trim())) {
      setSubmitError('That payout wallet address does not look right.');
      return;
    }
    setSubmitBusy(true);
    setSubmitError(null);
    try {
      await saveClaim({
        authorName: checkedName,
        authorId: checkedAuthorId,
        originPlatform: originPlatform.trim(),
        originUsername: originUsername.trim(),
        originUrl: originUrl.trim(),
        evidenceUris,
        message: message.trim(),
        payoutWallet: payoutWallet.trim(),
        balanceAtSubmit: formatUnits(stats.balance, USDC_DECIMALS),
      });
      await refreshClaims();
      setOriginPlatform('');
      setOriginUsername('');
      setOriginUrl('');
      setEvidenceUris([]);
      setMessage('');
      setPayoutWallet('');
      setSubmitted(true);
    } catch {
      setSubmitError('The claim could not be saved. Try again.');
    } finally {
      setSubmitBusy(false);
    }
  };

  const pickEvidence = async () => {
    if (evidenceUris.length >= 10) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (!result.canceled) {
        const uri = result.assets[0]?.uri;
        if (uri) {
          setEvidenceUris((current) => (current.length >= 10 ? current : [...current, uri]));
          setSubmitError(null);
          setSubmitted(false);
        }
      }
    } catch {
      setSubmitError('The photo library could not be opened. Try again.');
    }
  };

  const removeEvidence = (uri: string) => {
    setEvidenceUris((current) => current.filter((item) => item !== uri));
    setSubmitted(false);
  };

  const handleApprove = async (claim: ClaimRequest) => {
    if (!OWNER_ADDRESS) {
      setReviewError('Review opens once the owner wallet is configured.');
      return;
    }
    setReviewBusyId(claim.id);
    setReviewError(null);
    try {
      const existing = getWalletSession() ?? (await connectWallet().catch(() => null));
      if (!existing) throw new TipError('no-wallet', 'Connect the owner wallet to review claims.');
      if (existing.address.toLowerCase() !== OWNER_ADDRESS.toLowerCase()) {
        throw new TipError('wrong-network', 'Connect the owner wallet to review claims.');
      }
      await ensureArcNetwork();
      await verifyAuthor(claim.authorId, claim.payoutWallet as Address);
      await markClaimApproved(claim.id);
      await refreshClaims();
    } catch (error) {
      setReviewError(plainError(error));
    } finally {
      setReviewBusyId(null);
    }
  };

  const handleWithdraw = async () => {
    if (!checkedAuthorId) return;
    setWithdrawBusy(true);
    setWithdrawError(null);
    setWithdrawTx(null);
    try {
      if (!connected) await connectWallet();
      await ensureArcNetwork();
      const hash = await withdrawTips(checkedAuthorId);
      setWithdrawTx(hash);
      setStats(await readAuthorStats(checkedAuthorId));
    } catch (error) {
      setWithdrawError(plainError(error));
    } finally {
      setWithdrawBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SubscreenHeader eyebrow="Authors" title="Claim tips" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}>
        <View style={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Find your tips</Text>
            <View style={styles.lookupRow}>
              <View style={styles.lookupLeft}>
                <TextInput
                  accessibilityLabel="Author name"
                  autoCapitalize="words"
                  onChangeText={(value) => {
                    setAuthorName(value);
                    setStats(null);
                    setSubmitted(false);
                  }}
                  placeholder="Author name as it appears on the book"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, styles.lookupInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  value={authorName}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!checkedAuthorId || lookupBusy}
                  onPress={() => void handleLookup()}
                  style={[styles.action, styles.lookupAction, { backgroundColor: colors.primary, opacity: !checkedAuthorId || lookupBusy ? 0.45 : 1 }]}
                >
                  {lookupBusy ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Check for tips</Text>
                  )}
                </Pressable>
                {lookupFailed ? (
                  <Text style={[styles.note, { color: colors.mutedForeground }]}>Author totals are unavailable right now.</Text>
                ) : null}
              </View>
              <View style={[styles.statPanel, { borderColor: colors.border }]}>
                <Text style={[styles.statEyebrow, { color: colors.mutedForeground }]}>UNCLAIMED</Text>
                {stats ? (
                  <Text style={[styles.statValue, { color: colors.foreground }]}>
                    ${usdcToUsd(formatUnits(stats.balance, USDC_DECIMALS))}
                    <Text style={[styles.statUnit, { color: colors.mutedForeground }]}>
                      {`  ${formatUnits(stats.balance, USDC_DECIMALS)} USDC`}
                    </Text>
                  </Text>
                ) : (
                  <Text style={[styles.statValue, { color: colors.mutedForeground }]}>—</Text>
                )}
                <View style={[styles.statDividerWide, { backgroundColor: colors.border }]} />
                {stats ? (
                  <Text style={[styles.tippersLine, { color: colors.foreground }]}>
                    {stats.tippers.toString()}
                    <Text style={[styles.statUnit, { color: colors.mutedForeground }]}>
                      {stats.tippers === 1n ? '  tipper' : '  tippers'}
                    </Text>
                  </Text>
                ) : (
                  <Text style={[styles.tippersLine, { color: colors.mutedForeground }]}>—</Text>
                )}
              </View>
            </View>
            {stats ? (
              <View style={styles.statusRow}>
                <Feather
                  name={stats.verified ? 'check-circle' : 'clock'}
                  size={14}
                  color={colors.primary}
                />
                <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                  {stats.verified ? 'Verified author.' : 'Not claimed yet. Tips are held safely until the author is verified.'}
                </Text>
              </View>
            ) : null}
          </View>

          {stats && checkedName && checkedAuthorId ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Prove authorship</Text>
              <Text style={[styles.note, { color: colors.mutedForeground }]}>
                Show where the novel was first uploaded: the platform, your username there, and a dashboard
                screenshot with the title, date, and username visible. A person reviews every claim.
              </Text>
              <TextInput
                accessibilityLabel="Original platform"
                autoCapitalize="words"
                onChangeText={(value) => {
                  setOriginPlatform(value);
                  setSubmitError(null);
                  setSubmitted(false);
                }}
                placeholder="First uploaded on (Royal Road, Wattpad, …)"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                value={originPlatform}
              />
              <TextInput
                accessibilityLabel="Username on the original platform"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => {
                  setOriginUsername(value);
                  setSubmitError(null);
                  setSubmitted(false);
                }}
                placeholder="Your username there"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                value={originUsername}
              />
              <TextInput
                accessibilityLabel="Link to the original novel page"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onChangeText={(value) => {
                  setOriginUrl(value);
                  setSubmitError(null);
                  setSubmitted(false);
                }}
                placeholder="Link to the original page (optional)"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                value={originUrl}
              />
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DASHBOARD SCREENSHOTS · {evidenceUris.length}/10</Text>
              <View style={styles.evidenceGrid}>
                {evidenceUris.map((uri) => (
                  <View key={uri} style={styles.evidenceCell}>
                    <Image accessibilityLabel="Dashboard evidence" source={{ uri }} style={styles.evidenceThumb} />
                    <Pressable
                      accessibilityLabel="Remove screenshot"
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => removeEvidence(uri)}
                      style={[styles.evidenceRemove, { backgroundColor: colors.background, borderColor: colors.border }]}
                    >
                      <Feather name="x" size={12} color={colors.foreground} />
                    </Pressable>
                  </View>
                ))}
                {evidenceUris.length < 10 ? (
                  <Pressable
                    accessibilityLabel="Attach dashboard screenshots"
                    accessibilityRole="button"
                    onPress={() => void pickEvidence()}
                    style={[styles.evidenceAdd, { borderColor: colors.border, backgroundColor: colors.background }]}
                  >
                    <Feather name="plus" size={18} color={colors.primary} />
                    <Text style={[styles.evidenceAddText, { color: colors.mutedForeground }]}>Add</Text>
                  </Pressable>
                ) : null}
              </View>
              <TextInput
                accessibilityLabel="Anything that helps the review"
                multiline
                onChangeText={(value) => {
                  setMessage(value);
                  setSubmitError(null);
                  setSubmitted(false);
                }}
                placeholder="Anything that helps the review (pen names, moved platforms, co-authors…)"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.messageInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                textAlignVertical="top"
                value={message}
              />
              <TextInput
                accessibilityLabel="Payout wallet"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => {
                  setPayoutWallet(value);
                  setSubmitError(null);
                  setSubmitted(false);
                }}
                placeholder="Payout wallet (0x…)"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                value={payoutWallet}
              />
              <Pressable
                accessibilityRole="button"
                disabled={submitBusy}
                onPress={() => void handleSubmit()}
                style={[styles.action, { backgroundColor: colors.primary, opacity: submitBusy ? 0.55 : 1 }]}
              >
                {submitBusy ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Submit claim</Text>
                )}
              </Pressable>
              {submitError ? <Text style={[styles.error, { color: colors.destructive }]}>{submitError}</Text> : null}
              {submitted ? <Text style={[styles.note, { color: colors.mutedForeground }]}>Under review. Nothing moves until the proof is approved.</Text> : null}
            </View>
          ) : null}

          {stats && stats.verified && stats.wallet && connected?.address.toLowerCase() === stats.wallet.toLowerCase() ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Withdraw</Text>
              <View style={[styles.statPanel, { borderColor: colors.border }]}>
                <View>
                  <Text style={[styles.statEyebrow, { color: colors.mutedForeground }]}>WAITING</Text>
                  <Text style={[styles.statValue, { color: colors.foreground }]}>
                    {formatUnits(stats.balance, USDC_DECIMALS)}
                    <Text style={[styles.statUnit, { color: colors.mutedForeground }]}> USDC</Text>
                  </Text>
                </View>
              </View>
              {withdrawTx ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(explorerTxUrl(withdrawTx))}
                  style={[styles.action, { backgroundColor: colors.secondary }]}
                >
                  <Text style={[styles.actionText, { color: colors.secondaryForeground }]}>View withdrawal</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={withdrawBusy || stats.balance <= 0n}
                  onPress={() => void handleWithdraw()}
                  style={[styles.action, { backgroundColor: colors.primary, opacity: withdrawBusy || stats.balance <= 0n ? 0.5 : 1 }]}
                >
                  {withdrawBusy ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Withdraw tips</Text>
                  )}
                </Pressable>
              )}
              {withdrawError ? <Text style={[styles.error, { color: colors.destructive }]}>{withdrawError}</Text> : null}
            </View>
          ) : null}

          {claims.length > 0 ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Claims on this device</Text>
              {claims.map((claim) => (
                <View key={claim.id} style={[styles.claim, { borderColor: colors.border }]}>
                  {claim.evidenceUris[0] ? (
                    <Image accessibilityLabel="Claim evidence" source={{ uri: claim.evidenceUris[0] }} style={styles.claimThumb} />
                  ) : null}
                  <View style={styles.claimCopy}>
                    <Text style={[styles.claimTitle, { color: colors.foreground }]}>{claim.authorName}</Text>
                    <Text style={[styles.claimAmount, { color: colors.foreground }]}>
                      {claim.balanceAtSubmit}
                      <Text style={[styles.statUnit, { color: colors.mutedForeground }]}> USDC</Text>
                    </Text>
                    <Text style={[styles.note, { color: colors.mutedForeground, marginTop: 2 }]}>
                      {claim.originPlatform} · {claim.originUsername}
                      {claim.evidenceUris.length > 1 ? ` · ${claim.evidenceUris.length} screenshots` : ''}
                    </Text>
                    {claim.message ? (
                      <Text style={[styles.note, { color: colors.mutedForeground, marginTop: 2 }]} numberOfLines={2}>
                        “{claim.message}”
                      </Text>
                    ) : null}
                    <Text style={[styles.note, { color: colors.mutedForeground, marginTop: 2 }]}>
                      {claim.status === 'approved' ? 'Approved' : 'Under review'}
                    </Text>
                  </View>
                  {claim.status === 'pending' ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={reviewBusyId !== null}
                      onPress={() => void handleApprove(claim)}
                      style={[styles.reviewButton, { borderColor: colors.border, opacity: reviewBusyId !== null ? 0.5 : 1 }]}
                    >
                      {reviewBusyId === claim.id ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <Text style={[styles.reviewText, { color: colors.foreground }]}>Review</Text>
                      )}
                    </Pressable>
                  ) : (
                    <Feather name="check-circle" size={18} color={colors.primary} />
                  )}
                </View>
              ))}
              {reviewError ? <Text style={[styles.error, { color: colors.destructive }]}>{reviewError}</Text> : null}
            </View>
          ) : null}
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
  input: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, marginTop: 12, fontFamily: 'Inter_500Medium', fontSize: 13 },
  action: { minHeight: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 8 },
  error: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 10 },
  statPanel: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14 },
  statEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.2 },
  statValue: { fontFamily: 'Georgia', fontSize: 24, lineHeight: 29, marginTop: 5 },
  statUnit: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  statDividerWide: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  tippersLine: { fontFamily: 'Georgia', fontSize: 17, lineHeight: 22 },
  lookupRow: { flexDirection: 'row', gap: 12, marginTop: 12, alignItems: 'stretch' },
  lookupLeft: { flex: 1 },
  lookupInput: { marginTop: 0 },
  lookupAction: { marginTop: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 },
  statusText: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, flex: 1 },
  claim: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  claimCopy: { flex: 1 },
  claimThumb: { width: 56, height: 56, borderRadius: 12 },
  claimTitle: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  claimAmount: { fontFamily: 'Georgia', fontSize: 18, lineHeight: 23, marginTop: 3 },
  reviewButton: { minHeight: 34, borderWidth: 1, borderRadius: 17, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  reviewText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  evidenceCell: { position: 'relative' },
  evidenceThumb: { width: 64, height: 64, borderRadius: 12 },
  evidenceRemove: { position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  evidenceAdd: { width: 64, height: 64, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  evidenceAddText: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.2, marginTop: 14 },
  messageInput: { minHeight: 76, paddingTop: 12, paddingBottom: 12, fontSize: 12, lineHeight: 18 },
});

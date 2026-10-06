import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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

export default function ClaimScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [authorName, setAuthorName] = useState('');
  const [stats, setStats] = useState<AuthorStats | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [proofCode, setProofCode] = useState('');
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
    if (!proofCode.trim()) {
      setSubmitError('Add the one-time code from your bio or dashboard.');
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
        code: proofCode.trim(),
        payoutWallet: payoutWallet.trim(),
        balanceAtSubmit: formatUnits(stats.balance, USDC_DECIMALS),
      });
      await refreshClaims();
      setProofCode('');
      setPayoutWallet('');
      setSubmitted(true);
    } catch {
      setSubmitError('The claim could not be saved. Try again.');
    } finally {
      setSubmitBusy(false);
    }
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
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={authorName}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!checkedAuthorId || lookupBusy}
              onPress={() => void handleLookup()}
              style={[styles.action, { backgroundColor: colors.primary, opacity: !checkedAuthorId || lookupBusy ? 0.45 : 1 }]}
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
            {stats ? (
              <View style={styles.stats}>
                <Text style={[styles.statsLine, { color: colors.foreground }]}>
                  {formatUnits(stats.balance, USDC_DECIMALS)} USDC · {stats.tippers.toString()} tipped this author
                </Text>
                <Text style={[styles.note, { color: colors.mutedForeground }]}>
                  {stats.verified ? 'Verified author.' : 'Not claimed yet. Tips are held safely until the author is verified.'}
                </Text>
              </View>
            ) : null}
          </View>

          {stats && checkedName && checkedAuthorId ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Prove authorship</Text>
              <Text style={[styles.note, { color: colors.mutedForeground }]}>
                Place the one-time code in your original bio or dashboard, then paste it below with your payout wallet.
              </Text>
              <TextInput
                accessibilityLabel="One-time code"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => {
                  setProofCode(value);
                  setSubmitError(null);
                  setSubmitted(false);
                }}
                placeholder="One-time code"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                value={proofCode}
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
              <Text style={[styles.note, { color: colors.mutedForeground }]}>
                {formatUnits(stats.balance, USDC_DECIMALS)} USDC waiting for this wallet.
              </Text>
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
                  <View style={styles.claimCopy}>
                    <Text style={[styles.claimTitle, { color: colors.foreground }]}>{claim.authorName}</Text>
                    <Text style={[styles.note, { color: colors.mutedForeground }]}>
                      {claim.balanceAtSubmit} USDC · {claim.status === 'approved' ? 'Approved' : 'Under review'}
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
  stats: { marginTop: 12 },
  statsLine: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 19 },
  claim: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  claimCopy: { flex: 1 },
  claimTitle: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  reviewButton: { minHeight: 34, borderWidth: 1, borderRadius: 17, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  reviewText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});

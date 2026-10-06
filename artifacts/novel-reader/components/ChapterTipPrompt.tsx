import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReaderPalette } from '@/utils/reader-style';

export function ChapterTipPrompt({
  onTip,
  palette,
}: {
  onTip: () => void;
  palette: ReaderPalette;
}) {
  return (
    <View style={[styles.prompt, { borderColor: palette.border }]}>
      <Feather name="gift" size={15} color={palette.accent} />
      <Text style={[styles.copy, { color: palette.muted }]}>Enjoying this? Tip the author.</Text>
      <Pressable
        accessibilityLabel="Tip the author"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onTip}
        style={[styles.action, { backgroundColor: palette.accent }]}
        testID="chapter-tip-prompt"
      >
        <Text style={[styles.actionText, { color: palette.background }]}>Tip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: { borderWidth: 1, borderRadius: 12, marginTop: 26, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  copy: { fontFamily: 'Inter_400Regular', fontSize: 12, flex: 1 },
  action: { minHeight: 32, borderRadius: 16, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});

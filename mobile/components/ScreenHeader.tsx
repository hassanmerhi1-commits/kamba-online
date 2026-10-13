import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '@/constants/theme';

interface Props {
  title: string;
  subtitle?: string;
  style?: ViewStyle;
  light?: boolean;
}

export function ScreenHeader({ title, subtitle, style, light }: Props) {
  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.title, light && styles.titleLight]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, light && styles.subtitleLight]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
  },
  titleLight: {
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 20,
  },
  subtitleLight: {
    color: 'rgba(255,255,255,0.88)',
  },
});

import { View, StyleSheet, ViewStyle } from 'react-native';
import { PatternOverlay } from '@/components/PatternOverlay';
import { Colors, Radius } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  tall?: boolean;
}

export function WaveHeader({ children, style, tall }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.hero, tall && styles.heroTall, style]}>
        <View style={styles.gradientTop} />
        <View style={styles.gradientMid} />
        <PatternOverlay />
        <View style={styles.content}>{children}</View>
      </View>
      <View style={styles.wave}>
        <View style={styles.waveBumpLeft} />
        <View style={styles.waveBumpRight} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.primaryDark,
  },
  heroTall: {
    paddingBottom: 44,
  },
  gradientTop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.heroGradientTop,
  },
  gradientMid: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
    backgroundColor: Colors.heroGradientBottom,
    opacity: 0.95,
  },
  content: {
    zIndex: 1,
  },
  wave: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -18,
    paddingHorizontal: 24,
    height: 20,
  },
  waveBumpLeft: {
    width: 80,
    height: 36,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    marginTop: -18,
  },
  waveBumpRight: {
    width: 80,
    height: 36,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    marginTop: -18,
  },
});

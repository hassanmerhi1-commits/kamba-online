import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

/** Subtle diamond grid — African textile inspired */
export function PatternOverlay() {
  const cells = Array.from({ length: 48 });

  return (
    <View style={styles.wrap} pointerEvents="none">
      {cells.map((_, i) => (
        <View
          key={i}
          style={[
            styles.diamond,
            {
              left: (i % 8) * 52 + (Math.floor(i / 8) % 2 === 0 ? 0 : 26),
              top: Math.floor(i / 8) * 52,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  diamond: {
    position: 'absolute',
    width: 10,
    height: 10,
    backgroundColor: Colors.pattern,
    transform: [{ rotate: '45deg' }],
    borderRadius: 1,
  },
});

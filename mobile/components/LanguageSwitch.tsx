import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { setLanguage } from '@/i18n';
import { Colors, Radius } from '@/constants/theme';

export function LanguageSwitch() {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'pt';

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.chip, lang === 'pt' && styles.chipActive]}
        onPress={() => setLanguage('pt')}
        activeOpacity={0.8}>
        <Text style={[styles.text, lang === 'pt' && styles.textActive]}>PT</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.chip, lang === 'en' && styles.chipActive]}
        onPress={() => setLanguage('en')}
        activeOpacity={0.8}>
        <Text style={[styles.text, lang === 'en' && styles.textActive]}>EN</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: Radius.pill,
    padding: 3,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    minWidth: 36,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: Colors.accent,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  textActive: {
    color: Colors.earth,
  },
});

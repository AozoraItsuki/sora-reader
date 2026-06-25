import { useTheme } from '@hooks/persisted';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { getString } from '@strings/translations';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import Color from 'color';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import ThemeSelectionStep from './ThemeSelectionStep';

enum OnboardingStep {
  WELCOME,
  PICK_THEME,
}

const FEATURES = [
  { icon: 'book-multiple-outline', label: 'Thousands of light novels' },
  { icon: 'download-circle-outline', label: 'Offline reading support' },
  { icon: 'translate', label: 'AI-powered translation' },
  { icon: 'palette-outline', label: 'Fully customizable reader' },
];

export default function OnboardingScreen() {
  const theme = useTheme();
  const [step, setStep] = useState<OnboardingStep>(OnboardingStep.WELCOME);

  const accentBg = Color(theme.primary).alpha(0.1).string();

  if (step === OnboardingStep.PICK_THEME) {
    return (
      <SafeAreaView
        style={[styles.root, { backgroundColor: theme.background }]}
      >
        <View style={styles.themeHeader}>
          <View style={[styles.stepBadge, { backgroundColor: accentBg }]}>
            <Text style={[styles.stepBadgeText, { color: theme.primary }]}>
              STEP 2 OF 2
            </Text>
          </View>
          <Text style={[styles.themeTitle, { color: theme.onSurface }]}>
            {getString('onboardingScreen.pickATheme')}
          </Text>
          <Text style={[styles.themeSubtitle, { color: theme.onSurfaceVariant }]}>
            You can change this anytime in Settings
          </Text>
        </View>

        <View
          style={[
            styles.themeContainer,
            {
              backgroundColor: Color(theme.surfaceVariant).alpha(0.4).string(),
              borderColor: Color(theme.onSurface).alpha(0.06).string(),
            },
          ]}
        >
          <ThemeSelectionStep />
        </View>

        <Button
          mode="contained"
          onPress={() => MMKVStorage.set('IS_ONBOARDED', true)}
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          labelStyle={[styles.primaryButtonLabel, { color: theme.onPrimary }]}
          contentStyle={styles.primaryButtonContent}
        >
          {getString('onboardingScreen.complete')}
        </Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.welcomeContent}>
        <View style={[styles.logoWrap, { backgroundColor: accentBg }]}>
          <Image
            source={require('../../../assets/logo.png')}
            tintColor={theme.primary}
            style={styles.logo}
          />
        </View>

        <View style={[styles.stepBadge, { backgroundColor: accentBg }]}>
          <Text style={[styles.stepBadgeText, { color: theme.primary }]}>
            STEP 1 OF 2
          </Text>
        </View>

        <Text style={[styles.headline, { color: theme.onSurface }]}>
          {getString('onboardingScreen.welcome')}
        </Text>
        <Text style={[styles.tagline, { color: theme.onSurfaceVariant }]}>
          Your personal light novel companion
        </Text>

        <View style={styles.featureList}>
          {FEATURES.map(({ icon, label }) => (
            <View key={label} style={styles.featureRow}>
              <View
                style={[
                  styles.featureIconWrap,
                  { backgroundColor: accentBg },
                ]}
              >
                <MaterialCommunityIcons
                  name={icon as any}
                  size={18}
                  color={theme.primary}
                />
              </View>
              <Text style={[styles.featureLabel, { color: theme.onSurface }]}>
                {label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.bottomSection}>
        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: theme.primary },
          ]}
          android_ripple={{ color: Color(theme.onPrimary).alpha(0.2).string() }}
          onPress={() => setStep(OnboardingStep.PICK_THEME)}
        >
          <Text style={[styles.primaryButtonLabel, { color: theme.onPrimary }]}>
            Get Started
          </Text>
          <MaterialCommunityIcons
            name="arrow-right"
            size={20}
            color={theme.onPrimary}
          />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 16,
  },
  welcomeContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  logoWrap: {
    alignSelf: 'flex-start',
    borderRadius: 24,
    marginBottom: 8,
    padding: 18,
  },
  logo: {
    height: 48,
    width: 48,
  },
  stepBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  headline: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 40,
    marginTop: 4,
  },
  tagline: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
    opacity: 0.75,
  },
  featureList: {
    gap: 12,
    marginTop: 16,
  },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  featureIconWrap: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  featureLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  bottomSection: {
    marginTop: 24,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingVertical: 16,
  },
  primaryButtonContent: {
    height: 52,
  },
  primaryButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  themeHeader: {
    gap: 6,
    paddingBottom: 16,
    paddingTop: 8,
  },
  themeTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 4,
  },
  themeSubtitle: {
    fontSize: 13,
    opacity: 0.7,
  },
  themeContainer: {
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    marginBottom: 16,
    overflow: 'hidden',
    paddingTop: 16,
  },
});

import { SegmentedControl } from '@components';
import type { SegmentedControlOption } from '@components/SegmentedControl';
import Switch from '@components/Switch/Switch';
import { useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import React, { useMemo } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMMKVBoolean, useMMKVString } from 'react-native-mmkv';
import switchTheme from 'react-native-theme-switch-animation';

type ThemeMode = 'light' | 'dark' | 'system';

interface AmoledToggleProps {
  theme: ThemeColors;
}

const AmoledToggle: React.FC<AmoledToggleProps> = ({ theme }) => {
  const [isAmoledBlack = false, setAmoledBlack] =
    useMMKVBoolean('AMOLED_BLACK');

  const toggle = () => setAmoledBlack(!isAmoledBlack);

  if (!theme.isDark) return null;

  return (
    <Pressable
      style={[
        styles.amoledContainer,
        { backgroundColor: theme.surfaceVariant },
      ]}
      onPress={toggle}
    >
      <Text style={[styles.amoledLabel, { color: theme.onSurface }]}>
        {getString('appearanceScreen.pureBlackDarkMode')}
      </Text>
      <Switch value={isAmoledBlack} onValueChange={toggle} />
    </Pressable>
  );
};

/**
 * Onboarding only asks for the mode, not a palette: the app ships a single
 * seed theme and everything else is built from it in Settings. Keeping this to
 * one decision also means the very first launch cannot end up pointing at a
 * stored theme id that no longer exists.
 */
export default function ThemeSelectionStep() {
  const theme = useTheme();
  const [themeMode = 'system', setThemeMode] = useMMKVString('THEME_MODE');

  const currentMode = themeMode as ThemeMode;

  const themeModeOptions: SegmentedControlOption<ThemeMode>[] = useMemo(
    () => [
      {
        value: 'light',
        label: getString('onboardingScreen.light'),
      },
      {
        value: 'dark',
        label: getString('onboardingScreen.dark'),
      },
      {
        value: 'system',
        label: getString('onboardingScreen.system'),
      },
    ],
    [],
  );

  const handleModeChange = (mode: ThemeMode, event: GestureResponderEvent) => {
    setThemeMode(mode);
    event.currentTarget.measure((_x1, _y1, width, height, px, py) => {
      switchTheme({
        switchThemeFunction: () => {},
        animationConfig: {
          type: 'circular',
          duration: 400,
          startingPoint: {
            cy: py + height / 2,
            cx: px + width / 2,
          },
        },
      });
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.segmentedControlContainer}>
        <SegmentedControl
          options={themeModeOptions}
          value={currentMode}
          onChange={handleModeChange}
          theme={theme}
        />
      </View>
      {/* AMOLED Toggle */}
      <AmoledToggle theme={theme} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  segmentedControlContainer: {
    marginBottom: 12,
  },
  amoledContainer: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  amoledLabel: {
    fontSize: 16,
    fontWeight: '400',
  },
});

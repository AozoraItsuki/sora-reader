import { ThemeColors } from '@theme/types';
import { generateCustomTheme, CUSTOM_THEME_ID_BASE } from '@theme/utils/generateCustomTheme';
import { useMMKVString } from 'react-native-mmkv';

export const CUSTOM_THEMES_KEY = 'CUSTOM_THEMES';

export interface CustomThemeInput {
  name: string;
  primary: string;
  background: string;
  isDark: boolean;
}

export const useCustomThemes = () => {
  const [customThemesJson, setCustomThemesJson] = useMMKVString(CUSTOM_THEMES_KEY);

  const customThemes: ThemeColors[] = (() => {
    if (!customThemesJson) return [];
    try {
      return JSON.parse(customThemesJson);
    } catch {
      return [];
    }
  })();

  const addCustomTheme = (input: CustomThemeInput) => {
    const id = CUSTOM_THEME_ID_BASE + Date.now() % 1000000;
    const newTheme = generateCustomTheme(
      id,
      input.name,
      input.primary,
      input.background,
      input.isDark,
    );
    const updated = [...customThemes, newTheme];
    setCustomThemesJson(JSON.stringify(updated));
    return newTheme;
  };

  const deleteCustomTheme = (id: number) => {
    const updated = customThemes.filter(t => t.id !== id);
    setCustomThemesJson(JSON.stringify(updated));
  };

  return {
    customThemes,
    addCustomTheme,
    deleteCustomTheme,
  };
};

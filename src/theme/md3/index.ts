import { defaultTheme } from './defaultTheme';

/**
 * The single bundled seed theme.
 *
 * Everything user-facing is recolored from this pair (see
 * `generateCustomTheme.ts`), so the app ships one look instead of a catalogue
 * of finished palettes. Ids stay at 100 because `useTheme.transformThemeId`
 * maps every legacy stored id onto this range.
 */
export const lightThemes = [{ ...defaultTheme.light, id: 100 }];
export const darkThemes = [{ ...defaultTheme.dark, id: 100 }];

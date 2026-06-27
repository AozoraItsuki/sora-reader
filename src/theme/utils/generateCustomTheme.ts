import Color from 'color';
import { ThemeColors } from '@theme/types';

export const CUSTOM_THEME_ID_BASE = 10000;

export function generateCustomTheme(
  id: number,
  name: string,
  primary: string,
  background: string,
  isDark: boolean,
): ThemeColors {
  const p = Color(primary);
  const textColor = isDark ? '#e6e1e5' : '#1c1b1f';
  const surfaceVariant = isDark
    ? p.mix(Color('#000000'), 0.7).hex()
    : p.mix(Color('#ffffff'), 0.75).hex();
  const onPrimary = p.luminosity() > 0.2 ? '#000000' : '#ffffff';
  const primaryContainer = isDark
    ? p.darken(0.25).hex()
    : p.mix(Color('#ffffff'), 0.7).hex();
  const onPrimaryContainer = isDark
    ? p.mix(Color('#ffffff'), 0.7).hex()
    : p.darken(0.55).hex();
  const secondary = isDark
    ? p.desaturate(0.4).mix(Color('#e6e1e5'), 0.4).hex()
    : p.desaturate(0.4).mix(Color('#1c1b1f'), 0.35).hex();
  const secondaryContainer = isDark
    ? p.desaturate(0.5).mix(Color('#1c1b1f'), 0.55).hex()
    : p.desaturate(0.5).mix(Color('#ffffff'), 0.75).hex();
  const outline = isDark
    ? p.mix(Color('#e6e1e5'), 0.35).hex()
    : p.mix(Color('#1c1b1f'), 0.35).hex();

  return {
    id,
    name,
    isDark,
    primary,
    onPrimary,
    primaryContainer,
    onPrimaryContainer,
    secondary,
    onSecondary: isDark ? p.darken(0.65).hex() : '#ffffff',
    secondaryContainer,
    onSecondaryContainer: isDark ? p.mix(Color('#ffffff'), 0.6).hex() : p.darken(0.5).hex(),
    tertiary: isDark ? '#efb8c8' : '#7e5260',
    onTertiary: isDark ? '#492532' : '#ffffff',
    tertiaryContainer: isDark ? '#633b48' : '#ffd8e4',
    onTertiaryContainer: isDark ? '#ffd8e4' : '#31111d',
    error: isDark ? 'rgb(255, 180, 171)' : 'rgb(186, 26, 26)',
    onError: isDark ? 'rgb(105, 0, 5)' : 'rgb(255, 255, 255)',
    errorContainer: isDark ? 'rgb(147, 0, 10)' : 'rgb(255, 218, 214)',
    onErrorContainer: isDark ? 'rgb(255, 180, 171)' : 'rgb(65, 0, 2)',
    background,
    onBackground: textColor,
    surface: background,
    onSurface: textColor,
    surfaceVariant,
    onSurfaceVariant: isDark ? '#cac4d0' : '#49454f',
    outline,
    outlineVariant: isDark ? p.mix(Color('#1c1b1f'), 0.55).hex() : p.mix(Color('#ffffff'), 0.6).hex(),
    shadow: '#000000',
    scrim: '#000000',
    inverseSurface: isDark ? '#e6e1e5' : '#313033',
    inverseOnSurface: isDark ? background : '#f4eff4',
    inversePrimary: isDark ? primary : p.mix(Color('#ffffff'), 0.5).hex(),
    surfaceDisabled: isDark
      ? 'rgba(230, 225, 229, 0.12)'
      : 'rgba(28, 27, 31, 0.12)',
    onSurfaceDisabled: isDark
      ? 'rgba(230, 225, 229, 0.38)'
      : 'rgba(28, 27, 31, 0.38)',
    backdrop: 'rgba(50, 47, 55, 0.4)',
  };
}

import { TermStyle } from '@utils/readerTerms';
import { TextStyle } from 'react-native';

/**
 * Text style for a term's replacement text, so the list row and the editor
 * preview render a term exactly the way the reader will.
 */
export const replacementTextStyle = (
  style: TermStyle | undefined,
  fallbackColor: string,
  fontSize = 14,
): TextStyle => ({
  color: style?.color ?? fallbackColor,
  fontSize,
  fontWeight: style?.bold ? '700' : '400',
  fontStyle: style?.italic ? 'italic' : 'normal',
  textDecorationLine: style?.underline ? 'underline' : 'none',
});

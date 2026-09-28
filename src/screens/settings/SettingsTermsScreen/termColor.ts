/**
 * User-entered term colors arrive as free text, so both notations people
 * actually type have to parse to the one form the reader CSS consumes.
 */
export type TermColorParse =
  | { ok: true; value: string }
  | { ok: false; error: 'empty' | 'invalid' };

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_CHANNEL_PATTERN = /^\d{1,3}$/;

const toHexPair = (channel: number): string =>
  channel.toString(16).padStart(2, '0');

/**
 * Parse a hex (`#ff0000`, `#f00`, with or without `#`) or RGB
 * (`255,0,0`, `rgb(255, 0, 0)`) color into `#rrggbb`.
 */
export function parseTermColor(input: string): TermColorParse {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, error: 'empty' };
  }

  const hex = HEX_PATTERN.exec(raw);
  if (hex) {
    const digits = hex[1] ?? '';
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map(digit => digit + digit)
            .join('')
        : digits;
    return { ok: true, value: `#${full.toLowerCase()}` };
  }

  const channels = raw
    .replace(/^rgba?\(/i, '')
    .replace(/\)$/, '')
    .split(/[, ]+/)
    .filter(Boolean);

  const isRgb =
    channels.length === 3 &&
    channels.every(channel => RGB_CHANNEL_PATTERN.test(channel)) &&
    channels.every(channel => Number(channel) <= 255);

  if (!isRgb) {
    return { ok: false, error: 'invalid' };
  }

  const hex6 = channels.map(channel => toHexPair(Number(channel))).join('');
  return { ok: true, value: `#${hex6}` };
}

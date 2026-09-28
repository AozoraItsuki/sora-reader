import { parseTermColor } from '../termColor';

describe('parseTermColor', () => {
  it('normalizes a six-digit hex color when the user omits the hash', () => {
    expect(parseTermColor('FF00AA')).toEqual({ ok: true, value: '#ff00aa' });
  });

  it('normalizes a three-digit hex color when the user omits the hash', () => {
    expect(parseTermColor('f00')).toEqual({ ok: true, value: '#ff0000' });
  });

  it('normalizes bare comma separated RGB channels', () => {
    expect(parseTermColor('0,128,255')).toEqual({
      ok: true,
      value: '#0080ff',
    });
  });

  it('normalizes an rgb() function with spaced channels', () => {
    expect(parseTermColor('rgb(255, 0, 0)')).toEqual({
      ok: true,
      value: '#ff0000',
    });
  });

  it('pads single digit channels to two hex digits', () => {
    expect(parseTermColor('1,2,3')).toEqual({ ok: true, value: '#010203' });
  });

  it('rejects an empty color as empty rather than invalid', () => {
    expect(parseTermColor('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects a hex color of the wrong length', () => {
    expect(parseTermColor('#ff00')).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects an RGB channel above 255', () => {
    expect(parseTermColor('256,0,0')).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects a color that is neither hex nor RGB', () => {
    expect(parseTermColor('reddish')).toEqual({
      ok: false,
      error: 'invalid',
    });
  });
});

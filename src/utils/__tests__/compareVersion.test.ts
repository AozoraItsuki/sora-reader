import { equal, newer, older } from '../compareVersion';

describe('compareVersion', () => {
  it('never treats a bare CI build number as an app version', () => {
    expect(newer('61', '2.0.4')).toBe(false);
    expect(older('61', '2.0.4')).toBe(false);
    expect(equal('61', '61')).toBe(true);
  });

  it('compares semver releases normally', () => {
    expect(newer('2.0.5', '2.0.4')).toBe(true);
    expect(newer('v2.0.4', '2.0.3')).toBe(true);
    expect(newer('2.0.4', '2.0.4')).toBe(false);
  });

  it('ranks a prerelease below its final release', () => {
    expect(newer('2.0.4-ci.61', '2.0.4')).toBe(false);
    expect(older('2.0.4-ci.61', '2.0.4')).toBe(true);
    expect(newer('2.0.4-ci.62', '2.0.4-ci.61')).toBe(true);
  });
});

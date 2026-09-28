import {
  getReaderSheetSnapPoints,
  MAX_READER_SHEET_HEIGHT,
  MIN_READER_SHEET_HEIGHT,
} from '../snapPoints';

describe('getReaderSheetSnapPoints', () => {
  it('scales with window height when growing the window', () => {
    // Given: a typical portrait phone window
    // When: the window grows
    // Then: both snap points grow proportionally
    const compact = getReaderSheetSnapPoints(640, 0);
    const tall = getReaderSheetSnapPoints(1280, 0);

    expect(tall[0]).toBeGreaterThan(compact[0]);
    expect(tall[1]).toBeGreaterThan(compact[1]);
  });

  it('reserves room for the bottom inset when growing the window', () => {
    // Given: the same window with and without a navigation bar
    // When: snap points are resolved
    // Then: the inset shrinks the sheet instead of pushing it off-screen
    const withoutInset = getReaderSheetSnapPoints(800, 0);
    const withInset = getReaderSheetSnapPoints(800, 48);

    expect(withInset[0]).toBe(376);
    expect(withInset[1]).toBe(677);
    expect(withInset[1]).toBeLessThan(withoutInset[1]);
  });

  it('stays inside the window when the window shrinks below the previous hard-coded points', () => {
    // Given: a short window that the old fixed 600dp point overflowed
    // When: snap points are resolved
    // Then: neither point exceeds the usable height
    const [half, expanded] = getReaderSheetSnapPoints(480, 0);

    expect(expanded).toBeLessThan(480);
    expect(half).toBeLessThan(expanded);
  });

  it('floors the sheet at the minimum when the window is shorter than the minimum', () => {
    // Given: a degenerate window shorter than the minimum sheet height
    // When: snap points are resolved
    // Then: the floor is applied and the points stay ordered
    const [half, expanded] = getReaderSheetSnapPoints(120, 0);

    expect(half).toBe(MIN_READER_SHEET_HEIGHT);
    expect(expanded).toBe(MIN_READER_SHEET_HEIGHT);
  });

  it('caps the sheet at the maximum on a tall window', () => {
    // Given: a tablet-sized window
    // When: snap points are resolved
    // Then: the expanded point is capped
    const [, expanded] = getReaderSheetSnapPoints(2400, 0);

    expect(expanded).toBe(MAX_READER_SHEET_HEIGHT);
  });
});

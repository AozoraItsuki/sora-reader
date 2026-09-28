// Snap points for the reader settings sheet.
//
// The previous hard-coded `[360, 600]` overflowed short windows (a 480dp-tall
// screen, or landscape where the window height shrinks) and under-used tall
// ones. Deriving them from the live window height keeps the sheet proportional
// across devices, orientations and font-scale changes.

/** Never collapse below this, so the sheet stays usable on tiny windows. */
export const MIN_READER_SHEET_HEIGHT = 200;
/** Never grow past this, so the sheet does not swallow tablets entirely. */
export const MAX_READER_SHEET_HEIGHT = 720;

const HALVED_FRACTION = 0.5;
const EXPANDED_FRACTION = 0.9;

const clamp = (value: number) =>
  Math.min(Math.max(value, MIN_READER_SHEET_HEIGHT), MAX_READER_SHEET_HEIGHT);

export function getReaderSheetSnapPoints(
  windowHeight: number,
  bottomInset: number,
): number[] {
  const available = Math.max(
    windowHeight - bottomInset,
    MIN_READER_SHEET_HEIGHT,
  );

  return [HALVED_FRACTION, EXPANDED_FRACTION].map(fraction =>
    clamp(Math.round(available * fraction)),
  );
}

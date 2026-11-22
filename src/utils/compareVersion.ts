interface ParsedVersion {
  core: number[];
  prerelease: string[] | null;
}

// Accepts semver-like versions (vX.Y.Z, X.Y, X.Y.Z-ci.N, +build metadata).
// Plain integers such as "61" are deliberately rejected: they are not app
// versions and used to be treated as newer than every real release.
const VERSION_RE = /^v?(\d+(?:\.\d+){1,3})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

const parseVersion = (input: string): ParsedVersion | null => {
  if (typeof input !== 'string') {
    return null;
  }

  const match = VERSION_RE.exec(input.trim());
  if (!match) {
    return null;
  }

  const prerelease = match[2]?.split('.') ?? null;
  if (prerelease?.some(part => part === '')) {
    return null;
  }

  return {
    core: match[1].split('.').map(Number),
    prerelease,
  };
};

const compareIdentifier = (a: string, b: string): number => {
  const aIsNumber = /^\d+$/.test(a);
  const bIsNumber = /^\d+$/.test(b);

  if (aIsNumber && bIsNumber) {
    const diff = Number(a) - Number(b);
    return diff > 0 ? 1 : diff < 0 ? -1 : 0;
  }
  if (aIsNumber) {
    return -1;
  }
  if (bIsNumber) {
    return 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
};

/** Returns -1 / 0 / 1, or null when either side is not semver-like. */
const compareVersions = (a: string, b: string): number | null => {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);
  if (!parsedA || !parsedB) {
    return null;
  }

  for (let i = 0; i < 3; i += 1) {
    const partA = parsedA.core[i] ?? 0;
    const partB = parsedB.core[i] ?? 0;
    if (partA !== partB) {
      return partA > partB ? 1 : -1;
    }
  }

  // A release is newer than its own prereleases (e.g. 2.0.4 > 2.0.4-ci.1).
  if (parsedA.prerelease === null || parsedB.prerelease === null) {
    if (parsedA.prerelease === parsedB.prerelease) {
      return 0;
    }
    return parsedA.prerelease === null ? 1 : -1;
  }

  const length = Math.max(parsedA.prerelease.length, parsedB.prerelease.length);
  for (let i = 0; i < length; i += 1) {
    const partA = parsedA.prerelease[i];
    const partB = parsedB.prerelease[i];
    if (partA === undefined || partB === undefined) {
      return partA === undefined ? -1 : 1;
    }
    const diff = compareIdentifier(partA, partB);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
};

export const older = (a: string, b: string): boolean =>
  (compareVersions(a, b) ?? 0) < 0;

export const equal = (a: string, b: string): boolean => {
  const result = compareVersions(a, b);
  if (result !== null) {
    return result === 0;
  }
  return String(a).trim() === String(b).trim();
};

export const newer = (a: string, b: string): boolean =>
  (compareVersions(a, b) ?? 0) > 0;

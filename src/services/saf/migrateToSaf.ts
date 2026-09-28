/**
 * One-shot migration: app-private NOVEL_STORAGE -> SAF download tree.
 *
 * Old layout (app-private, absolute `file://` paths):
 *   {ROOT_STORAGE}/Novels/{pluginId}/{novelId}/cover.png
 *   {ROOT_STORAGE}/Novels/{pluginId}/{novelId}/{chapterId}/index.html
 *   {ROOT_STORAGE}/Novels/{pluginId}/{novelId}/{chapterId}/{i}.b64.png
 *
 * New layout (SAF tree, tree-relative paths, identical shape under `Novels/`):
 *   Novels/{pluginId}/{novelId}/cover.png
 *   Novels/{pluginId}/{novelId}/{chapterId}/index.html
 *   Novels/{pluginId}/{novelId}/{chapterId}/{i}.b64.png
 *
 * Post-migration invariants:
 * - every `index.html` has its absolute `file://.../{i}.b64.png` img srcs
 *   rewritten to the bare `{i}.b64.png` filename, because the reader resolves
 *   them against a local-server baseUrl;
 * - every `novel.cover` is tree-relative (`Novels/{pluginId}/{novelId}/cover.png`).
 *
 * Guarded by SAF_MIGRATION_DONE and requires a live SAF permission. Never
 * throws: the app must always boot. Failures are logged and the legacy tree is
 * left in place for the next attempt.
 */
import { dbManager } from '@database/db';
import {
  getNovelChapters,
  setChapterDownloaded,
} from '@database/queries/ChapterQueries';
import { chapterSchema, novelSchema } from '@database/schema';
import DebugLogService from '@services/DebugLogService';
import {
  ensureSafPermission,
  getSafTreeUri,
  isSafMigrationDone,
  markSafMigrationDone,
  safExists,
  safGetFileSize,
  safMkdir,
  safWriteFile,
} from '@services/saf/safFile';
import {
  chapterIndexRel,
  chapterRel,
  coverRel,
  novelDirRel,
  NOVELS_ROOT,
} from '@utils/DownloadPaths';
import { NOVEL_STORAGE } from '@utils/Storages';
import { eq } from 'drizzle-orm';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';

import {
  asRowId,
  collectLegacyChapterRefs,
  type LegacyChapterRef,
  nativeFileExists,
  nativeFileReadDir,
  nativeFileReadFile,
  nativeFileUnlink,
} from './legacyTreeScan';

const BTAG = '[SafMigration]';

/** Legacy assets stored as text rather than base64 payloads. */
const TEXT_ASSETS = new Set(['index.html', '.nomedia']);

const log = (level: 'log' | 'warn' | 'error' | 'info', message: string) => {
  try {
    DebugLogService.addEntry(level, message);
  } catch {
    console[level === 'log' ? 'log' : level](`${BTAG} ${message}`);
  }
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Rewrite absolute legacy img srcs to bare filenames.
 *
 * `<img src="file://{oldRoot}/{pluginId}/{novelId}/{chapterId}/3.b64.png">`
 *   -> `<img src="3.b64.png">`
 *
 * Any other absolute legacy reference collapses to its basename so the document
 * only ever points at files sitting next to index.html.
 */
export const rewriteChapterHtml = (html: string, oldRoot: string): string => {
  const step1 = html.replace(
    new RegExp(
      `(<img\\b[^>]*?\\bsrc=["'])file:\\/\\/[^"']*\\/(\\d+\\.b64\\.png)(["'])`,
      'gi',
    ),
    '$1$2$3',
  );
  return step1.replace(
    new RegExp(`file:\\/\\/${escapeRegExp(oldRoot)}\\/[^"']+`, 'g'),
    match => match.split('/').pop() || '',
  );
};

/**
 * Normalize a stored cover to a tree-relative path.
 *
 * - `file://{oldRoot}/{pluginId}/{novelId}/cover.png` -> `Novels/{pluginId}/{novelId}/cover.png`
 * - `file://{oldRoot}/Novels/{...}`                   -> `Novels/{...}`
 * - already-relative / remote                        -> unchanged (sans cache-buster)
 */
export const relativizeCoverPath = (cover: string, oldRoot: string): string => {
  const withoutQuery = cover.split('?')[0];
  // Remote covers must survive untouched, cache-buster included.
  if (/^(?:https?|data|content):/i.test(withoutQuery)) {
    return cover;
  }
  // Already tree-relative.
  if (!/^(?:\/|file:\/\/)/i.test(withoutQuery)) {
    return withoutQuery;
  }
  // Map the app-private absolute path back onto the tree. `oldRoot` is usually
  // NOVEL_STORAGE (which already ends in `Novels/`), but tolerate being handed
  // ROOT_STORAGE as well.
  const absolute = withoutQuery.replace(/^file:\/\//, '');
  const legacyPrefix = `${oldRoot.replace(/\/+$/, '')}/`;
  if (absolute.startsWith(legacyPrefix)) {
    const rest = absolute.slice(legacyPrefix.length);
    return rest.startsWith(`${NOVELS_ROOT}/`) ? rest : `${NOVELS_ROOT}/${rest}`;
  }
  return withoutQuery;
};

/** Absolute app-private path of a tree-relative download path. */
export const legacyAbsPath = (oldRoot: string, treeRel: string) =>
  `${oldRoot}/${treeRel.replace(/^Novels\//, '')}`;

/**
 * True when the legacy app-private NOVEL_STORAGE still holds anything.
 * Best-effort and never throws — drives the manual Migrate button state.
 */
export const hasLegacyDownloads = (): boolean => {
  if (!nativeFileExists(NOVEL_STORAGE)) {
    return false;
  }
  return nativeFileReadDir(NOVEL_STORAGE).length > 0;
};

/** One app-private file to copy, and the tree-relative path to copy it to. */
type FileCopy = {
  /** Absolute app-private path of the file to read. */
  source: string;
  /** Tree-relative path to write it to. */
  treeRel: string;
  encoding: 'utf8' | 'base64';
  transform?: (content: string) => string;
};

/**
 * expo-file-system only accepts `file://` URIs. The legacy tree is tracked as
 * bare absolute paths, so prefix them here — a bare path makes the read throw
 * and the asset silently never migrates.
 */
const legacyFileUri = (absPath: string): string =>
  absPath.startsWith('file://') ? absPath : `file://${absPath}`;

/**
 * Copy one app-private file into the SAF tree, then drop the original — but
 * ONLY after the destination verifies (exists and non-empty). A null/empty
 * read or a failed verify returns false and the source is left untouched, so
 * a failed copy can never destroy data.
 *
 * `source` and `treeRel` need not agree on the plugin folder: a chapter whose
 * plugin was renamed is read from where it is and written to where the reader
 * will look for it.
 */
const migrateFile = async ({
  source,
  treeRel,
  encoding,
  transform,
}: FileCopy): Promise<boolean> => {
  if (!nativeFileExists(source)) {
    return false;
  }
  if (await safExists(treeRel)) {
    // Already migrated by an earlier partial run — just drop the duplicate.
    nativeFileUnlink(source);
    return true;
  }

  await safMkdir(treeRel.slice(0, treeRel.lastIndexOf('/')));
  if (encoding === 'utf8') {
    const raw = nativeFileReadFile(source);
    if (raw == null || raw.length === 0) {
      return false;
    }
    await safWriteFile(treeRel, transform ? transform(raw) : raw, 'utf8');
  } else {
    const base64 = await readAsStringAsync(legacyFileUri(source), {
      encoding: EncodingType.Base64,
    });
    if (!base64 || base64.length === 0) {
      return false;
    }
    await safWriteFile(treeRel, base64, 'base64');
  }

  // Verify BEFORE deleting the source: the destination must exist and hold
  // bytes, otherwise the next run retries instead of finding a hole.
  const size = await safGetFileSize(treeRel).catch(() => -1);
  if (size <= 0) {
    return false;
  }
  nativeFileUnlink(source);
  return true;
};

/** True when `absolutePath` already lives inside the SAF download tree. */
const isInsideTree = (absolutePath: string): boolean => {
  const treeRoot = getSafTreeUri();
  return !!treeRoot && absolutePath.startsWith(`${treeRoot}/`);
};

type ChapterRow = { id: number; novelId: number };
type NovelRow = { id: number; pluginId: string; cover: string | null };

/** Copy one legacy chapter folder into the tree, then drop the original. */
const migrateChapter = async (
  ref: LegacyChapterRef,
  oldRoot: string,
): Promise<void> => {
  const { fromPluginId, toPluginId, novelId, chapterId } = ref;
  const chapterDirRel = chapterRel(toPluginId, novelId, chapterId);
  const legacyChapterDir = `${oldRoot}/${fromPluginId}/${novelId}/${chapterId}`;
  if (!nativeFileExists(legacyChapterDir)) {
    return;
  }

  // A run that crashed after copying but before cleanup already left the folder
  // in its final location. `safMove` only addresses paths inside the tree, so
  // there is nothing left to copy and nothing to remove.
  if (isInsideTree(legacyChapterDir)) {
    return;
  }

  await safMkdir(chapterDirRel);

  // Every file is copied AND verified before its source is dropped. When any
  // file fails the whole folder stays: deleting the directory around a hole
  // is exactly how chapters went missing. The next run retries the leftovers
  // (already-migrated files are detected via the tree and just unlinked).
  let complete = true;
  try {
    // index.html: text, with absolute img srcs rewritten to bare filenames.
    complete = await migrateFile({
      source: `${legacyChapterDir}/index.html`,
      treeRel: chapterIndexRel(toPluginId, novelId, chapterId),
      encoding: 'utf8',
      transform: html => rewriteChapterHtml(html, oldRoot),
    });
  } catch {
    complete = false;
  }

  // Everything else in the chapter folder is a binary payload.
  for (const entry of nativeFileReadDir(legacyChapterDir)) {
    if (entry.isDirectory) {
      continue;
    }
    try {
      complete =
        (await migrateFile({
          source: `${legacyChapterDir}/${entry.name}`,
          treeRel: `${chapterDirRel}/${entry.name}`,
          encoding: TEXT_ASSETS.has(entry.name) ? 'utf8' : 'base64',
        })) && complete;
    } catch {
      complete = false;
    }
  }

  if (!complete) {
    throw new Error(
      `incomplete chapter ${chapterId}; legacy folder kept for retry`,
    );
  }
  nativeFileUnlink(legacyChapterDir);
};

/** A `cover.png` found on disk, wherever its plugin folder claims to be. */
export type LegacyCoverRef = {
  /** Absolute app-private path of the cover file. */
  source: string;
  novelId: number;
  /** Plugin folder the file actually sits under (may be stale/renamed). */
  fromPluginId: string;
};

/**
 * Walk the legacy tree for `cover.png` files: `{oldRoot}/{anyPlugin}/{novelId}/cover.png`.
 *
 * Covers are discovered by FILENAME, not from the DB — the DB cover may point
 * at a renamed plugin folder while the bytes sit under the stale one.
 * Best-effort and never throws.
 */
export const collectLegacyCoverRefs = (oldRoot: string): LegacyCoverRef[] => {
  const refs: LegacyCoverRef[] = [];
  try {
    for (const pluginEntry of nativeFileReadDir(oldRoot)) {
      if (!pluginEntry.isDirectory) {
        continue;
      }
      for (const novelEntry of nativeFileReadDir(pluginEntry.path)) {
        if (!novelEntry.isDirectory) {
          continue;
        }
        const novelId = asRowId(novelEntry.name);
        if (novelId === null) {
          continue;
        }
        const source = `${novelEntry.path}/cover.png`;
        if (nativeFileExists(source)) {
          refs.push({ source, novelId, fromPluginId: pluginEntry.name });
        }
      }
    }
  } catch {
    return [];
  }
  return refs;
};

const migrateNovelCover = async (
  row: NovelRow,
  oldRoot: string,
  coverRefs: LegacyCoverRef[],
): Promise<boolean> => {
  const { id, pluginId, cover } = row;
  if (!cover) {
    return false;
  }
  const relative = relativizeCoverPath(cover, oldRoot);
  if (relative === cover) {
    // Already relative or remote — the DB needs no update. But a leftover
    // legacy file the DB already points at must still move into the tree:
    // otherwise the tree never holds the cover and the legacy root never
    // drains. Remote covers have no local file, so only tree-relative ones
    // are claimed here.
    if (!relative.startsWith(`${NOVELS_ROOT}/`)) {
      return false;
    }
    const leftover = legacyAbsPath(oldRoot, relative);
    if (!nativeFileExists(leftover)) {
      return false;
    }
    await safMkdir(novelDirRel(pluginId, id));
    return migrateFile({
      source: leftover,
      treeRel: relative,
      encoding: 'base64',
    }).catch(() => false);
  }

  // Find the bytes on disk under ANY plugin folder. When nothing is found the
  // DB is left untouched: rewriting it to a path with no file behind it is
  // exactly how covers went blank.
  const ref = coverRefs.find(coverRef => coverRef.novelId === id);
  if (!ref) {
    log('warn', `${BTAG} Cover for novel ${id} not found on disk; keeping DB`);
    return false;
  }

  await safMkdir(novelDirRel(pluginId, id));
  const destRel = coverRel(pluginId, id);
  const copied = await migrateFile({
    source: ref.source,
    treeRel: destRel,
    encoding: 'base64',
  }).catch(() => false);
  if (!copied) {
    return false;
  }

  await dbManager.write(async tx => {
    await tx
      .update(novelSchema)
      .set({ cover: destRel })
      .where(eq(novelSchema.id, id))
      .run();
  });
  return true;
};

/**
 * The chapters this run will copy, in order.
 *
 * Two sources feed it. The downloaded rows come first because a row knows the
 * pluginId the reader looks under today. The legacy tree comes second and covers
 * what the DB cannot see at all: a chapter whose novel row is gone, or one left
 * behind under a plugin folder that was renamed. Sources are de-duplicated by
 * where their files actually sit, so a chapter both sources know is copied once
 * and lands on the row's pluginId either way.
 */
const planChapterMigrations = (
  rows: ChapterRow[],
  pluginIdByNovelId: Map<number, string>,
  oldRoot: string,
): LegacyChapterRef[] => {
  const pluginIdByChapter = new Map<string, string>();
  for (const row of rows) {
    const pluginId = pluginIdByNovelId.get(row.novelId);
    if (pluginId) {
      pluginIdByChapter.set(`${row.novelId}/${row.id}`, pluginId);
    }
  }

  const planned = new Map<string, LegacyChapterRef>();
  const plan = (ref: LegacyChapterRef) => {
    const key = `${ref.fromPluginId}/${ref.novelId}/${ref.chapterId}`;
    if (planned.has(key)) {
      return;
    }
    planned.set(key, {
      ...ref,
      toPluginId:
        pluginIdByChapter.get(`${ref.novelId}/${ref.chapterId}`) ??
        // A chapter with no DB row of its own (orphan of a deleted novel row,
        // or never inserted) still belongs to a known novel — remap it via the
        // novel, not the stale folder it was found under.
        pluginIdByNovelId.get(ref.novelId) ??
        ref.fromPluginId,
    });
  };

  for (const row of rows) {
    const pluginId = pluginIdByNovelId.get(row.novelId);
    if (pluginId) {
      plan({
        fromPluginId: pluginId,
        toPluginId: pluginId,
        novelId: row.novelId,
        chapterId: row.id,
      });
    }
  }
  for (const ref of collectLegacyChapterRefs(oldRoot)) {
    plan(ref);
  }

  // A row whose chapter was migrated by an earlier run has nothing left to copy.
  return Array.from(planned.values()).filter(ref =>
    nativeFileExists(
      legacyAbsPath(
        oldRoot,
        chapterRel(ref.fromPluginId, ref.novelId, ref.chapterId),
      ),
    ),
  );
};

/**
 * True when the legacy tree holds nothing this run could not identify.
 *
 * Only a novel folder's own `cover.png` may remain: a migrated chapter folder is
 * removed outright, so any entry still inside one — payload or marker — is data
 * nobody claimed, and so is a folder whose name is not a row id. Deleting the
 * root then would destroy it.
 */
const legacyTreeIsDrained = (oldRoot: string): boolean => {
  for (const pluginEntry of nativeFileReadDir(oldRoot)) {
    if (!pluginEntry.isDirectory) {
      return false;
    }
    for (const novelEntry of nativeFileReadDir(pluginEntry.path)) {
      if (!novelEntry.isDirectory) {
        if (novelEntry.name !== 'cover.png') {
          return false;
        }
        continue;
      }
      if (
        asRowId(novelEntry.name) === null ||
        nativeFileReadDir(novelEntry.path).length > 0
      ) {
        return false;
      }
    }
  }
  return true;
};

/**
 * Make the downloaded flags agree with what is actually on disk.
 *
 * - flag true but no `index.html` in the tree or the legacy root: the reader
 *   would fall back to the source and export would still find the row, so
 *   clear the flag and stop the UI from lying;
 * - flag false but an `index.html` IS in the tree (restore-from-backup or a
 *   source refresh re-inserted the row without flags): heal the flag so the
 *   reader serves the local file and export sees the chapter.
 *
 * Idempotent and never throws. Runs on every migration pass, including when
 * there is no legacy tree left.
 */
export const reconcileDownloadFlags = async (): Promise<{
  healed: number;
  cleared: number;
}> => {
  let healed = 0;
  let cleared = 0;
  try {
    const novels: NovelRow[] = await dbManager
      .select({
        id: novelSchema.id,
        pluginId: novelSchema.pluginId,
        cover: novelSchema.cover,
      })
      .from(novelSchema)
      .all();
    for (const novel of novels) {
      let chapters: Array<{ id: number; isDownloaded: boolean | null }>;
      try {
        chapters = await getNovelChapters(novel.id);
      } catch {
        continue;
      }
      for (const chapter of chapters) {
        const indexRel = chapterIndexRel(novel.pluginId, novel.id, chapter.id);
        let onDisk = false;
        try {
          onDisk =
            (await safExists(indexRel)) ||
            nativeFileExists(
              legacyAbsPath(
                NOVEL_STORAGE,
                chapterRel(novel.pluginId, novel.id, chapter.id),
              ),
            );
        } catch {
          continue;
        }
        try {
          if (chapter.isDownloaded && !onDisk) {
            await setChapterDownloaded(chapter.id, false);
            cleared++;
          } else if (!chapter.isDownloaded && onDisk) {
            const treeHit = await safExists(indexRel).catch(() => false);
            if (treeHit) {
              await setChapterDownloaded(chapter.id, true);
              healed++;
            }
          }
        } catch {
          // One bad row must not stop the reconcile of the rest.
        }
      }
    }
  } catch (e) {
    log('warn', `${BTAG} Reconcile aborted: ${String(e)}`);
  }
  return { healed, cleared };
};

/**
 * Migrate legacy NOVEL_STORAGE downloads into the SAF tree exactly once.
 *
 * Requires a live SAF permission. Never throws. `force` re-runs a migration that
 * is already marked done, which is what the manual Migrate button needs.
 * `onProgress` is called once per migrated chapter and cover with the
 * tree-relative path it was working on.
 */
export const runSafMigration = async (
  onProgress?: (done: number, total: number, label: string) => void,
  force = false,
): Promise<void> => {
  if (!force && isSafMigrationDone()) {
    return;
  }

  try {
    if (!(await ensureSafPermission())) {
      log('log', `${BTAG} Skipped: SAF download tree permission not granted`);
      return;
    }
    if (!getSafTreeUri()) {
      log('log', `${BTAG} Skipped: no SAF download tree configured`);
      return;
    }

    // Heal flag/disk disagreements first: a restore or refresh may have left
    // rows unflagged while their files sit in the tree (reader would fetch
    // from source, export would find nothing). Runs even with no legacy tree.
    const { healed, cleared } = await reconcileDownloadFlags();
    if (healed > 0 || cleared > 0) {
      log(
        'info',
        `${BTAG} Reconciled flags: ${healed} healed, ${cleared} cleared`,
      );
    }

    const oldRoot = NOVEL_STORAGE;
    if (!nativeFileExists(oldRoot)) {
      log('log', `${BTAG} No legacy ${oldRoot}; marking done`);
      markSafMigrationDone();
      return;
    }

    const novels: NovelRow[] = await dbManager
      .select({
        id: novelSchema.id,
        pluginId: novelSchema.pluginId,
        cover: novelSchema.cover,
      })
      .from(novelSchema)
      .all();
    const pluginIdByNovelId = new Map(novels.map(n => [n.id, n.pluginId]));

    const downloadedChapters = await dbManager
      .select({ id: chapterSchema.id, novelId: chapterSchema.novelId })
      .from(chapterSchema)
      .where(eq(chapterSchema.isDownloaded, true))
      .all();

    const chapterRefs = planChapterMigrations(
      downloadedChapters,
      pluginIdByNovelId,
      oldRoot,
    );
    const coverNovels = novels.filter(novel => novel.cover !== null);
    const total = chapterRefs.length + coverNovels.length;
    let done = 0;
    let migratedChapters = 0;
    let chapterFailures = 0;
    for (const ref of chapterRefs) {
      const label = chapterRel(ref.toPluginId, ref.novelId, ref.chapterId);
      try {
        await migrateChapter(ref, oldRoot);
        migratedChapters++;
      } catch (e) {
        chapterFailures++;
        log(
          'error',
          `${BTAG} Failed to migrate chapter ${ref.chapterId}: ${String(e)}`,
        );
      }
      onProgress?.(++done, total, label);
    }

    let migratedCovers = 0;
    let coverFailures = 0;
    const coverRefs = collectLegacyCoverRefs(oldRoot);
    for (const novel of coverNovels) {
      const label = coverRel(novel.pluginId, novel.id);
      try {
        if (await migrateNovelCover(novel, oldRoot, coverRefs)) {
          migratedCovers++;
        }
      } catch (e) {
        coverFailures++;
        log(
          'error',
          `${BTAG} Failed to migrate cover for novel ${novel.id}: ${String(e)}`,
        );
      }
      onProgress?.(++done, total, label);
    }

    // Novel dirs that only ever held a cover may still exist in the tree.
    for (const novel of novels) {
      const novelRel = novelDirRel(novel.pluginId, novel.id);
      if (nativeFileExists(legacyAbsPath(oldRoot, novelRel))) {
        await safMkdir(novelRel).catch(() => undefined);
      }
    }

    if (!legacyTreeIsDrained(oldRoot)) {
      log(
        'warn',
        `${BTAG} Legacy ${oldRoot} not empty; keeping it for the next attempt`,
      );
      return;
    }
    // The tree is drained, so it can go. PLUGIN_STORAGE is a sibling of
    // NOVEL_STORAGE and is never touched.
    nativeFileUnlink(oldRoot);

    if (chapterFailures === 0 && coverFailures === 0) {
      markSafMigrationDone();
    }
    log(
      'info',
      `${BTAG} Done: ${migratedChapters} chapters, ${migratedCovers} covers, ` +
        `${chapterFailures + coverFailures} failures`,
    );
  } catch (e) {
    // Never throw — the app must always boot.
    log('error', `${BTAG} Migration aborted: ${String(e)}`);
  }
};

/** Exposed for tests and for the post-migration cleanup step. */
export const _legacyAbsPath = legacyAbsPath;

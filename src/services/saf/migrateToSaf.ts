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
import { chapterSchema, novelSchema } from '@database/schema';
import DebugLogService from '@services/DebugLogService';
import {
  ensureSafPermission,
  getSafTreeUri,
  isSafMigrationDone,
  markSafMigrationDone,
  safExists,
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
 * Copy one app-private file into the SAF tree, then drop the original.
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
    const raw = nativeFileReadFile(source) ?? '';
    await safWriteFile(treeRel, transform ? transform(raw) : raw, 'utf8');
  } else {
    const base64 = await readAsStringAsync(source, {
      encoding: EncodingType.Base64,
    });
    await safWriteFile(treeRel, base64, 'base64');
  }
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

  // index.html: text, with absolute img srcs rewritten to bare filenames.
  await migrateFile({
    source: `${legacyChapterDir}/index.html`,
    treeRel: chapterIndexRel(toPluginId, novelId, chapterId),
    encoding: 'utf8',
    transform: html => rewriteChapterHtml(html, oldRoot),
  });

  // Everything else in the chapter folder is a binary payload.
  for (const entry of nativeFileReadDir(legacyChapterDir)) {
    if (entry.isDirectory) {
      continue;
    }
    await migrateFile({
      source: `${legacyChapterDir}/${entry.name}`,
      treeRel: `${chapterDirRel}/${entry.name}`,
      encoding: TEXT_ASSETS.has(entry.name) ? 'utf8' : 'base64',
    });
  }

  nativeFileUnlink(legacyChapterDir);
};

const migrateNovelCover = async (
  row: NovelRow,
  oldRoot: string,
): Promise<boolean> => {
  const { id, pluginId, cover } = row;
  if (!cover) {
    return false;
  }
  const relative = relativizeCoverPath(cover, oldRoot);

  await safMkdir(novelDirRel(pluginId, id));
  const copied = await migrateFile({
    source: legacyAbsPath(oldRoot, coverRel(pluginId, id)),
    treeRel: coverRel(pluginId, id),
    encoding: 'base64',
  }).catch(() => false);
  if (copied) {
    // Drop ONLY the cover we copied. The chapter folders live in the same
    // directory, so removing the novel directory here would destroy any
    // chapter that failed to migrate.
    nativeFileUnlink(legacyAbsPath(oldRoot, coverRel(pluginId, id)));
  }

  if (relative === cover) {
    // Already relative or remote — the DB needs no update.
    return false;
  }

  await dbManager.write(async tx => {
    await tx
      .update(novelSchema)
      .set({ cover: relative })
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
    for (const novel of coverNovels) {
      const label = coverRel(novel.pluginId, novel.id);
      try {
        if (await migrateNovelCover(novel, oldRoot)) {
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

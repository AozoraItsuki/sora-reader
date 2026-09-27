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
import NativeFile from '@specs/NativeFile';
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
  if (!NativeFileExists(NOVEL_STORAGE)) {
    return false;
  }
  return NativeFileReadDir(NOVEL_STORAGE).length > 0;
};

/** Copy one app-private file into the SAF tree, then drop the original. */
const migrateFile = async (
  oldRoot: string,
  treeRel: string,
  encoding: 'utf8' | 'base64',
  transform?: (content: string) => string,
): Promise<boolean> => {
  const source = legacyAbsPath(oldRoot, treeRel);
  if (!NativeFileExists(source)) {
    return false;
  }
  if (await safExists(treeRel)) {
    // Already migrated by an earlier partial run — just drop the duplicate.
    NativeFileUnlink(source);
    return true;
  }

  await safMkdir(treeRel.slice(0, treeRel.lastIndexOf('/')));
  if (encoding === 'utf8') {
    const raw = NativeFileReadFile(source) ?? '';
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

/**
 * Every native FS call is best-effort: a throw here must not abort the migration.
 */
const NativeFileExists = (path: string): boolean => {
  try {
    return NativeFile.exists(path);
  } catch {
    return false;
  }
};

const NativeFileReadFile = (path: string): string | null => {
  try {
    return NativeFile.readFile(path) ?? null;
  } catch {
    return null;
  }
};

const NativeFileReadDir = (dirPath: string) => {
  try {
    return NativeFile.readDir(dirPath) ?? [];
  } catch {
    return [];
  }
};

const NativeFileUnlink = (path: string) => {
  try {
    NativeFile.unlink(path);
  } catch {
    // Best effort — the legacy root is removed wholesale at the end anyway.
  }
};

type ChapterRow = { id: number; novelId: number };
type NovelRow = { id: number; pluginId: string; cover: string | null };

const migrateChapter = async (
  row: ChapterRow,
  pluginId: string,
  oldRoot: string,
): Promise<void> => {
  const { id, novelId } = row;
  const chapterDirRel = chapterRel(pluginId, novelId, id);
  const legacyChapterDir = legacyAbsPath(oldRoot, chapterDirRel);
  if (!NativeFileExists(legacyChapterDir)) {
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
  await migrateFile(
    oldRoot,
    chapterIndexRel(pluginId, novelId, id),
    'utf8',
    html => rewriteChapterHtml(html, oldRoot),
  );

  // Everything else in the chapter folder is a binary payload.
  for (const entry of NativeFileReadDir(legacyChapterDir)) {
    if (entry.isDirectory) {
      continue;
    }
    const rel = `${chapterDirRel}/${entry.name}`;
    await migrateFile(
      oldRoot,
      rel,
      TEXT_ASSETS.has(entry.name) ? 'utf8' : 'base64',
    );
  }

  NativeFileUnlink(legacyChapterDir);
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
  const copied = await migrateFile(
    oldRoot,
    coverRel(pluginId, id),
    'base64',
  ).catch(() => false);
  if (copied) {
    // Drop ONLY the cover we copied. The chapter folders live in the same
    // directory, so removing the novel directory here would destroy any
    // chapter that failed to migrate.
    NativeFileUnlink(legacyAbsPath(oldRoot, coverRel(pluginId, id)));
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
 * Remove the legacy NOVEL_STORAGE directory, but only once nothing we know how
 * to migrate is still inside it (a partially-migrated chapter, a novel without a
 * DB row). PLUGIN_STORAGE is a sibling of NOVEL_STORAGE and is never touched.
 */
const removeLegacyStorageIfDrained = async (
  oldRoot: string,
  pluginIdByNovelId: Map<number, string>,
): Promise<boolean> => {
  const remainingChapters = await dbManager
    .select({ id: chapterSchema.id, novelId: chapterSchema.novelId })
    .from(chapterSchema)
    .where(eq(chapterSchema.isDownloaded, true))
    .all();

  for (const chapter of remainingChapters) {
    const pluginId = pluginIdByNovelId.get(chapter.novelId);
    if (!pluginId) {
      // The chapter was never migrated because its novel row is gone, so we
      // cannot prove the legacy tree is safe to delete. Keep it.
      return false;
    }
    if (
      NativeFileExists(
        legacyAbsPath(
          oldRoot,
          chapterRel(pluginId, chapter.novelId, chapter.id),
        ),
      )
    ) {
      return false;
    }
  }

  // Any leftover file that is not part of a known chapter folder means the
  // legacy tree still holds data we would silently destroy.
  for (const entry of NativeFileReadDir(oldRoot)) {
    if (entry.isDirectory) {
      const novelEntries = NativeFileReadDir(entry.path);
      for (const novelEntry of novelEntries) {
        if (novelEntry.isDirectory) {
          const chapterEntries = NativeFileReadDir(novelEntry.path);
          if (
            chapterEntries.some(c => !c.isDirectory && !TEXT_ASSETS.has(c.name))
          ) {
            return false;
          }
        } else if (novelEntry.name !== 'cover.png') {
          return false;
        }
      }
    }
  }

  NativeFileUnlink(oldRoot);
  return true;
};

/**
 * Migrate legacy NOVEL_STORAGE downloads into the SAF tree exactly once.
 *
 * Requires a live SAF permission. Never throws.
 */
export const runSafMigration = async (): Promise<void> => {
  if (isSafMigrationDone()) {
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
    if (!NativeFileExists(oldRoot)) {
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

    let migratedChapters = 0;
    let chapterFailures = 0;
    let unmappedChapters = 0;
    for (const chapter of downloadedChapters) {
      const pluginId = pluginIdByNovelId.get(chapter.novelId);
      if (!pluginId) {
        // Without the owning novel's pluginId there is no tree path to copy
        // into, so the chapter is left behind rather than guessed at.
        unmappedChapters++;
        log(
          'warn',
          `${BTAG} Chapter ${chapter.id} has no novel row; leaving it in legacy storage`,
        );
        continue;
      }
      try {
        await migrateChapter(chapter, pluginId, oldRoot);
        migratedChapters++;
      } catch (e) {
        chapterFailures++;
        log(
          'error',
          `${BTAG} Failed to migrate chapter ${chapter.id}: ${String(e)}`,
        );
      }
    }

    let migratedCovers = 0;
    let coverFailures = 0;
    for (const novel of novels) {
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
    }

    // Novel dirs that only ever held a cover may still exist in the tree.
    for (const novel of novels) {
      const novelRel = novelDirRel(novel.pluginId, novel.id);
      if (NativeFileExists(legacyAbsPath(oldRoot, novelRel))) {
        await safMkdir(novelRel).catch(() => undefined);
      }
    }

    const drained = await removeLegacyStorageIfDrained(
      oldRoot,
      pluginIdByNovelId,
    );
    if (!drained) {
      log(
        'warn',
        `${BTAG} Legacy ${oldRoot} not empty; keeping it for the next attempt`,
      );
      return;
    }

    if (
      chapterFailures === 0 &&
      coverFailures === 0 &&
      unmappedChapters === 0
    ) {
      markSafMigrationDone();
    }
    log(
      'info',
      `${BTAG} Done: ${migratedChapters} chapters, ${migratedCovers} covers, ` +
        `${chapterFailures + coverFailures} failures, ` +
        `${unmappedChapters} unmapped chapters`,
    );
  } catch (e) {
    // Never throw — the app must always boot.
    log('error', `${BTAG} Migration aborted: ${String(e)}`);
  }
};

/** Exposed for tests and for the post-migration cleanup step. */
export const _legacyAbsPath = legacyAbsPath;

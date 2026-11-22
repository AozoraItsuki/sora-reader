import { dbManager } from '@database/db';
import {
  getChapter,
  setChapterDownloaded,
} from '@database/queries/ChapterQueries';
import { getNovelById } from '@database/queries/NovelQueries';
import { chapterSchema } from '@database/schema';
import {
  ACTIVE_AI_PROVIDER_KEY,
  AI_PROVIDERS_KEY,
  AIProvider,
} from '@hooks/persisted/useAIProviders';
import {
  DOWNLOAD_SETTINGS,
  DownloadSettings,
  initialDownloadSettings,
  initialTranslateSettings,
  TRANSLATE_SETTINGS,
  TranslateSettings,
} from '@hooks/persisted/useSettings';
import { getPlugin } from '@plugins/pluginManager';
import { Plugin } from '@plugins/types';
import {
  safDownloadFile,
  safGetFileSize,
  safMkdir,
  safUnlink,
  safWriteFile,
} from '@services/saf/safFile';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import {
  TranslateConfig,
  TranslateManager,
} from '@services/translate/TranslateManager';
import { getString } from '@strings/translations';
import {
  chapterImageRel,
  chapterIndexRel,
  chapterRel,
  nomediaRel,
} from '@utils/DownloadPaths';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';
import * as cheerio from 'cheerio';
import { eq } from 'drizzle-orm';

import {
  isCloudflareOrIPBanError,
  torNewIdentity,
} from './torControl';

/** `3.b64.png` — the bare filename the reader resolves against its baseUrl. */
const imageFileName = (index: number) => `${index}.b64.png`;

/** Bound parallel native/HTTP image writes so image-heavy chapters stay responsive. */
const createLimiter = (limit: number) => {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= limit) {
      await new Promise<void>(resolve => waiting.push(resolve));
    }
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
};

/** A cancelled download must be distinguishable from a real failure. */
const createAbortError = () => {
  const error = new Error('Download cancelled');
  error.name = 'AbortError';
  return error;
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw createAbortError();
  }
};

const isAbortError = (error: unknown): boolean =>
  (error as { name?: string } | null)?.name === 'AbortError';

/**
 * Short pages that are really scrape errors/challenges. A translator can return
 * one of these (translated or not) without throwing, so they are rejected by
 * the same gate as an empty page. The length bound keeps ordinary chapters that
 * merely mention "error" from being mistaken for an error page.
 */
const ERROR_SENTINELS = [
  'chapter is empty',
  'chapter empty',
  'chapter not found',
  'content not found',
  'no content available',
  'page not found',
  '404 not found',
  '403 forbidden',
  'access denied',
  'too many requests',
  'rate limit',
  'please enable javascript',
  'enable javascript and cookies',
  'just a moment',
  'checking your browser',
  'cloudflare',
  'turnstile',
  'an error occurred',
  'something went wrong',
  'failed to load',
  'download failed',
  'scrape error',
];

/**
 * True only when the HTML carries visible, non-error text. Tags, scripts and
 * whitespace do not count — a whitespace-only or tag-only parse result (or a
 * degraded translation) must never be persisted as an offline chapter.
 */
export const hasMeaningfulChapterText = (html: string): boolean => {
  if (typeof html !== 'string' || html.trim().length === 0) {
    return false;
  }
  let text: string;
  try {
    const $ = cheerio.load(html, null, false);
    $('script, style, noscript, template, svg').remove();
    text = $.root()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return false;
  }
  if (text.length === 0) {
    return false;
  }
  const lower = text.toLowerCase();
  return !(
    text.length <= 200 &&
    ERROR_SENTINELS.some(sentinel => lower.includes(sentinel))
  );
};

type ImageOutcome = { ok: boolean; error?: unknown };

const createChapterFolder = async (data: {
  pluginId: string;
  novelId: number;
  chapterId: number;
  signal?: AbortSignal;
}): Promise<string> => {
  const chapterFolder = chapterRel(data.pluginId, data.novelId, data.chapterId);
  throwIfAborted(data.signal);
  await safMkdir(chapterFolder);
  throwIfAborted(data.signal);
  await safWriteFile(nomediaRel(data.pluginId, data.novelId, data.chapterId), ',');
  return chapterFolder;
};

const downloadFiles = async (
  html: string,
  plugin: Plugin,
  novelId: number,
  chapterId: number,
  signal?: AbortSignal,
): Promise<void> => {
  const pluginId = plugin.id;
  await createChapterFolder({ pluginId, novelId, chapterId, signal });
  throwIfAborted(signal);
  const loadedCheerio = cheerio.load(html);
  const imgs = loadedCheerio('img').toArray();

  // Same absolute URL in multiple <img> tags (e.g. repeated character
  // portraits) must download once and share the same local file. Sharing the
  // in-flight promise also prevents a duplicate download when both tags are
  // processed before the first write settles.
  const imageByUrl = new Map<
    string,
    { fileName: string; outcome: Promise<ImageOutcome> }
  >();
  const limit = createLimiter(6);

  const writeImage = (url: string, relPath: string): Promise<ImageOutcome> =>
    limit(async () => {
      throwIfAborted(signal);
      try {
        // Inline payloads can never be fetched by the native HTTP downloader,
        // so write them straight into the chapter folder instead.
        if (url.startsWith('data:')) {
          const comma = url.indexOf(',');
          const base64 = comma >= 0 ? url.slice(comma + 1) : '';
          if (!base64) {
            return { ok: false, error: 'Empty data URI image' };
          }
          throwIfAborted(signal);
          await safWriteFile(relPath, base64, 'base64');
        } else {
          throwIfAborted(signal);
          await safDownloadFile(url, relPath, plugin.imageRequestInit);
        }
        return { ok: true };
      } catch (e) {
        // Cancellation must propagate so the chapter is never marked
        // downloaded; ordinary image failures stay non-fatal.
        if (isAbortError(e)) {
          throw e;
        }
        return { ok: false, error: e };
      }
    });

  await Promise.all(
    imgs.map(async (img, i) => {
      throwIfAborted(signal);
      const elem = loadedCheerio(img);
      const url = elem.attr('src');
      if (!url) {
        return;
      }
      let absoluteURL: string;
      try {
        absoluteURL = new URL(url, plugin.site).href;
      } catch {
        return;
      }
      let image = imageByUrl.get(absoluteURL);
      if (!image) {
        image = {
          fileName: imageFileName(i),
          outcome: writeImage(
            absoluteURL,
            chapterImageRel(pluginId, novelId, chapterId, i),
          ),
        };
        imageByUrl.set(absoluteURL, image);
      }
      const outcome = await image.outcome;
      if (outcome.ok) {
        // Only point at the local copy once its bytes are actually on disk.
        // RELATIVE src: the reader resolves it against the local-server baseUrl.
        elem.attr('src', image.fileName);
      } else {
        // Keep the original src so the reader can still load the image from
        // the network, and record why no offline copy was created.
        elem.attr('alt', String(outcome.error ?? 'Image download failed'));
      }
    }),
  );
  throwIfAborted(signal);
  await safWriteFile(
    chapterIndexRel(pluginId, novelId, chapterId),
    loadedCheerio.html(),
  );
};

async function fetchChapterWithProxyRetry(
  plugin: Plugin,
  chapterPath: string,
  downloadSettings: DownloadSettings,
): Promise<string> {
  const proxy = { ...initialDownloadSettings.proxy, ...downloadSettings.proxy };
  const isTorMode = proxy.mode === 'tor';
  const identityWaitMs = (downloadSettings.retryDelaySeconds ?? 60) * 1000;

  const attempt = () => plugin.parseChapter(chapterPath);

  let chapterText: string;
  try {
    chapterText = await attempt();
  } catch (err: any) {
    if (isTorMode && isCloudflareOrIPBanError(err)) {
      try {
        await torNewIdentity(proxy);
      } catch {
        // Ignore — identity request best-effort
      }
      await new Promise(r => setTimeout(r, identityWaitMs));
      chapterText = await attempt();
    } else {
      throw err;
    }
  }

  // Check if the returned HTML itself is a Cloudflare challenge page
  if (isTorMode && chapterText && isCloudflareOrIPBanError(null, chapterText)) {
    try {
      await torNewIdentity(proxy);
    } catch {
      // Ignore — identity request best-effort
    }
    await new Promise(r => setTimeout(r, identityWaitMs));
    chapterText = await attempt();
  }

  return chapterText;
}

export const downloadChapter = async (
  { chapterId }: { chapterId: number },
  setMeta: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
  signal?: AbortSignal,
) => {
  throwIfAborted(signal);
  setMeta(meta => ({
    ...meta,
    isRunning: true,
  }));

  // Captured as soon as it is known so the failure path can remove a partially
  // written folder even when a later write (or the abort check) throws.
  let cleanupTarget: { pluginId: string; novelId: number } | null = null;
  let startedWriting = false;

  try {
    const chapter = await getChapter(chapterId);
    if (!chapter) {
      throw new Error('Chapter not found with id: ' + chapterId);
    }
    if (chapter.isDownloaded) {
      setMeta(meta => ({
        ...meta,
        isRunning: false,
      }));
      return;
    }
    const novel = await getNovelById(chapter.novelId);
    if (!novel) {
      throw new Error('Novel not found for chapter: ' + chapter.name);
    }
    const plugin = getPlugin(novel.pluginId);
    if (!plugin) {
      throw new Error(getString('downloadScreen.pluginNotFound'));
    }
    cleanupTarget = { pluginId: novel.pluginId, novelId: novel.id };

    const downloadSettings =
      getMMKVObject<DownloadSettings>(DOWNLOAD_SETTINGS) ||
      initialDownloadSettings;

    throwIfAborted(signal);
    const chapterText = await fetchChapterWithProxyRetry(
      plugin,
      chapter.path,
      downloadSettings,
    );
    throwIfAborted(signal);

    // A scrape that produced no visible text is never worth storing.
    if (!hasMeaningfulChapterText(chapterText)) {
      throw new Error(getString('downloadScreen.chapterEmptyOrScrapeError'));
    }

    let finalHtml = chapterText;

    const translateSettings =
      getMMKVObject<TranslateSettings>(TRANSLATE_SETTINGS) ||
      initialTranslateSettings;

    if (translateSettings.downloadTranslated) {
      try {
        const providers = getMMKVObject<AIProvider[]>(AI_PROVIDERS_KEY) || [];
        const activeProviderId = getMMKVObject<string>(ACTIVE_AI_PROVIDER_KEY);
        const activeAIProvider = providers.find(p => p.id === activeProviderId);

        const config: TranslateConfig = {
          ...(translateSettings as any),
          activeAIProvider,
        };

        // Pass the signal so cancelling a download also cancels translation.
        finalHtml = await TranslateManager.translateChapterHTML(
          finalHtml,
          config,
          undefined,
          signal,
        );
        const loadedCheerio = cheerio.load(finalHtml, null, false);
        const metaHTML = '<meta id="offline-translated-marker"/>';
        if (loadedCheerio('body').length > 0) {
          loadedCheerio('body').prepend(metaHTML);
        } else {
          loadedCheerio.root().prepend(metaHTML);
        }
        finalHtml = loadedCheerio.html();
      } catch (e) {
        // Cancellation must abort the whole download, not fall back to the
        // untranslated text and keep writing files.
        if (isAbortError(e)) {
          throw e;
        }
        console.error(e);
        showToast('Error when translating chapter ' + chapter.name);
        finalHtml = chapterText;
      }
    }

    throwIfAborted(signal);

    // Final gate: a silent empty/degraded translation is just as unusable as an
    // empty scrape, so nothing is written and the DB flag stays false.
    if (!hasMeaningfulChapterText(finalHtml)) {
      throw new Error(getString('downloadScreen.chapterEmptyOrScrapeError'));
    }

    startedWriting = true;
    await downloadFiles(finalHtml, plugin, novel.id, chapter.id, signal);

    // A cancelled download must never be persisted as downloaded.
    throwIfAborted(signal);

    // The flag may only be set once index.html is actually on disk with bytes.
    const indexRel = chapterIndexRel(novel.pluginId, novel.id, chapter.id);
    const writtenBytes = await safGetFileSize(indexRel);
    if (!(writtenBytes > 0)) {
      throw new Error(getString('downloadScreen.chapterEmptyOrScrapeError'));
    }

    throwIfAborted(signal);
    await dbManager.write(async tx => {
      throwIfAborted(signal);
      // dbManager.write awaits this callback before committing — without the
      // await here the flag can be lost (or reject after the tx has closed).
      await tx
        .update(chapterSchema)
        .set({ isDownloaded: true })
        .where(eq(chapterSchema.id, chapter.id))
        .run();
    });

    setMeta(meta => ({
      ...meta,
      progress: 1,
      isRunning: false,
    }));
  } catch (error) {
    // Best-effort rollback. Cleanup must never mask the original failure.
    if (startedWriting && cleanupTarget) {
      try {
        await safUnlink(
          chapterRel(cleanupTarget.pluginId, cleanupTarget.novelId, chapterId),
        );
      } catch {
        // ignore cleanup failure
      }
    }
    try {
      await setChapterDownloaded(chapterId, false);
    } catch {
      // ignore flag-reset failure; the original error is the one to surface
    }
    setMeta(meta => ({
      ...meta,
      isRunning: false,
    }));
    throw error;
  }
};

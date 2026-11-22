import { dbManager } from '@database/db';
import { getChapter } from '@database/queries/ChapterQueries';
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
  safMkdir,
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

type ImageOutcome = { ok: boolean; error?: unknown };

const createChapterFolder = async (data: {
  pluginId: string;
  novelId: number;
  chapterId: number;
}): Promise<string> => {
  const chapterFolder = chapterRel(data.pluginId, data.novelId, data.chapterId);
  await safMkdir(chapterFolder);
  await safWriteFile(nomediaRel(data.pluginId, data.novelId, data.chapterId), ',');
  return chapterFolder;
};

const downloadFiles = async (
  html: string,
  plugin: Plugin,
  novelId: number,
  chapterId: number,
): Promise<void> => {
  const pluginId = plugin.id;
  await createChapterFolder({ pluginId, novelId, chapterId });
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
      try {
        // Inline payloads can never be fetched by the native HTTP downloader,
        // so write them straight into the chapter folder instead.
        if (url.startsWith('data:')) {
          const comma = url.indexOf(',');
          const base64 = comma >= 0 ? url.slice(comma + 1) : '';
          if (!base64) {
            return { ok: false, error: 'Empty data URI image' };
          }
          await safWriteFile(relPath, base64, 'base64');
        } else {
          await safDownloadFile(url, relPath, plugin.imageRequestInit);
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e };
      }
    });

  await Promise.all(
    imgs.map(async (img, i) => {
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
) => {
  setMeta(meta => ({
    ...meta,
    isRunning: true,
  }));

  const chapter = await getChapter(chapterId);
  if (!chapter) {
    throw new Error('Chapter not found with id: ' + chapterId);
  }
  if (chapter.isDownloaded) {
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

  const downloadSettings =
    getMMKVObject<DownloadSettings>(DOWNLOAD_SETTINGS) ||
    initialDownloadSettings;

  const chapterText = await fetchChapterWithProxyRetry(
    plugin,
    chapter.path,
    downloadSettings,
  );

  if (chapterText && chapterText.length) {
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

        finalHtml = await TranslateManager.translateChapterHTML(
          finalHtml,
          config,
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
        console.error(e);
        showToast('Error when translating chapter ' + chapter.name);
        finalHtml = chapterText;
      }
    }

    await downloadFiles(finalHtml, plugin, novel.id, chapter.id);

    await dbManager.write(async tx => {
      // dbManager.write awaits this callback before committing — without the
      // await here the flag can be lost (or reject after the tx has closed).
      await tx
        .update(chapterSchema)
        .set({ isDownloaded: true })
        .where(eq(chapterSchema.id, chapter.id))
        .run();
    });
  } else {
    throw new Error(getString('downloadScreen.chapterEmptyOrScrapeError'));
  }

  setMeta(meta => ({
    ...meta,
    progress: 1,
    isRunning: false,
  }));
};

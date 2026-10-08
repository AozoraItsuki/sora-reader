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
  // portraits) must download once and share the same local file.
  const fileNameByUrl = new Map<string, string>();

  const downloadTasks = imgs.map((img, i) => {
    const elem = loadedCheerio(img);
    const url = elem.attr('src');
    if (!url) {
      return Promise.resolve();
    }
    const absoluteURL = new URL(url, plugin.site).href;
    const existingFileName = fileNameByUrl.get(absoluteURL);
    if (existingFileName !== undefined) {
      // RELATIVE src: the reader resolves it against the local-server baseUrl.
      elem.attr('src', existingFileName);
      return Promise.resolve();
    }
    const fileName = imageFileName(i);
    fileNameByUrl.set(absoluteURL, fileName);
    // RELATIVE src: the reader resolves it against the local-server baseUrl.
    elem.attr('src', fileName);
    return safDownloadFile(
      absoluteURL,
      chapterImageRel(pluginId, novelId, chapterId, i),
      plugin.imageRequestInit,
    ).catch(e => {
      elem.attr('alt', String(e));
    });
  });

  await Promise.all(downloadTasks);
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
      tx.update(chapterSchema)
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

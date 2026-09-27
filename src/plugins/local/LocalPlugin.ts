import { Storage } from '@plugins/helpers/storage';
import {
  ImageRequestInit,
  NovelItem,
  Plugin,
  PluginSettings,
  SourceNovel,
  SourcePage,
} from '@plugins/types';
import NativeFile from '@specs/NativeFile';
import { isAbsoluteUri } from '@utils/DownloadPaths';
import { NOVEL_STORAGE } from '@utils/Storages';
import { load } from 'cheerio';

import { getLocalFileUrl, getLocalServerUrl } from './localServerManager';

export const LOCAL_PLUGIN_ID = 'local';

const storage = new Storage(LOCAL_PLUGIN_ID);

/** `file://` URIs of an imported EPUB chapter's assets, any absolute root. */
const FILE_LOCAL_CHAPTER_SRC =
  /file:\/\/[^\s"']*\/Novels\/local\/\d+\/([^\s"']+)/g;

/** Local-server URLs that carry the `Novels` prefix. */
const SERVER_CHAPTER_SRC =
  /https?:\/\/[^/\s"']+\/Novels\/local\/\d+\/([^\s"']+)/g;

/** Local-server URLs rooted straight at the `local` plugin. */
const SERVER_LOCAL_SRC = /https?:\/\/[^/\s"']+\/local\/\d+\/([^\s"']+)/g;

/**
 * A built-in plugin that handles locally imported novels (EPUBs).
 *
 * Instead of fetching from a remote source, it reads from the local
 * database and filesystem. All file:// URIs in chapter HTML are
 * rewritten to http://localhost:PORT/ to avoid FileUriExposedException.
 */
class LocalPlugin implements Plugin {
  id = LOCAL_PLUGIN_ID;
  name = 'Local EPUBs';
  site = '';
  lang = 'Multi';
  version = '1.0.0';
  url = '';
  iconUrl =
    'https://raw.githubusercontent.com/Yuneko-dev/sorareader-plugins/refs/heads/master/public/static/epub.png';
  imageRequestInit: ImageRequestInit = { headers: {} };
  hasSettings = true;
  webStorageUtilized = false;

  pluginSettings: PluginSettings = {
    disableEpubCss: {
      label: `Disable the default CSS of EPUB. This means the application's CSS will take priority.`,
      value: false,
      type: 'Switch',
    },
  };

  get disableEpubCss(): boolean {
    return Boolean(storage.get('disableEpubCss', false));
  }

  async popularNovels(): Promise<NovelItem[]> {
    throw new Error('Do not open it in this plugin. Use Category instead.');
  }

  async searchNovels(): Promise<NovelItem[]> {
    throw new Error('Do not open it in this plugin. Use Category instead.');
  }

  async parseNovel(): Promise<SourceNovel> {
    throw new Error('Do not open it in this plugin. Use Category instead.');
  }

  async parsePage(): Promise<SourcePage> {
    throw new Error('Do not open it in this plugin. Use Category instead.');
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // chapterPath format: NOVEL_STORAGE/local/{novelId}/{chapterId}/index.html
    // or just the directory path
    const filePath = chapterPath.endsWith('/index.html')
      ? chapterPath
      : chapterPath + '/index.html';

    if (!NativeFile.exists(filePath)) {
      return '';
    }

    let html = NativeFile.readFile(filePath);

    // Strip absolute image paths down to just the filename so they resolve
    // against the WebView's baseUrl (the local server) like a real web page.
    // Three shapes have to be handled:
    //   a) the old app-private prefix
    //      file:///storage/.../files/Novels/local/124/0.b64.png → 0.b64.png
    //   b) the local server serving the SAF tree
    //      http://127.0.0.1:1234/Novels/local/124/0.b64.png → 0.b64.png
    //   c) a server URL without the Novels prefix (older base URLs)
    //      http://127.0.0.1:1234/local/124/0.b64.png → 0.b64.png
    html = html
      .replace(FILE_LOCAL_CHAPTER_SRC, '$1')
      .replace(SERVER_CHAPTER_SRC, '$1')
      .replace(SERVER_LOCAL_SRC, '$1');

    const $ = load(html);

    if (this.disableEpubCss) {
      // Remove all stylesheet including those in <head> and <body>
      $.root()
        .find('link[rel="stylesheet"]')
        .each((i, el) => {
          $(el).remove();
        });
    }

    html = $.html();

    return html;
  }

  resolveUrl(path: string): string {
    const serverUrl = getLocalServerUrl();
    if (!serverUrl) {
      return path;
    }

    // A bare or relative name is an asset inside a chapter directory, so it has
    // to be anchored to that chapter on the local server instead of being
    // handed back unresolved.
    if (path && !isAbsoluteUri(path)) {
      return getLocalFileUrl(path);
    }

    if (path.startsWith(NOVEL_STORAGE)) {
      return path.replace(NOVEL_STORAGE, `${serverUrl}/Novels`);
    }
    return path;
  }
}

export const localPlugin = new LocalPlugin();

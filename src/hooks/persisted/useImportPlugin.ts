import {
  extractPluginMetadata,
  pluginIconUrl,
  type PluginMetadataRejection,
} from '@plugins/helpers/importPlugin';
import { normalizePluginLang } from '@plugins/pluginManager';
import type { PluginItem } from '@plugins/types';
import NativeFile from '@specs/NativeFile';
import { getString } from '@strings/translations';
import type { StringMap } from '@strings/types';
import { fileExtension } from '@utils/localImport';
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';
import { PLUGIN_STORAGE } from '@utils/Storages';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback } from 'react';

import usePlugins, { INSTALLED_PLUGINS } from './usePlugins';

const rejectionMessageKey = {
  missingDefaultExport: 'browseScreen.importNotPlugin',
  missingFields: 'browseScreen.importMissingFields',
} as const satisfies Record<PluginMetadataRejection, keyof StringMap>;

/**
 * Import a plugin from a local .js file: pick → validate metadata → write the
 * code next to every other installed plugin → upsert the installed list →
 * re-filter so the Installed tab shows it right away.
 */
export const useImportPlugin = () => {
  const { refreshPlugins, languagesFilter } = usePlugins();

  return useCallback(async () => {
    try {
      // Android intent MIME filtering is unreliable for .js files (see the
      // custom CSS/JS importer); the extension check below is the filter.
      const picked = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: false,
      });
      if (picked.canceled) {
        return;
      }
      const asset = picked.assets[0];
      const extension =
        fileExtension(asset.name) || fileExtension(asset.uri ?? '');
      if (extension !== 'js') {
        showToast(getString('browseScreen.importWrongType'));
        return;
      }

      const tempPath =
        NativeFile.getConstants().ExternalCachesDirectoryPath +
        '/imported_plugin.js';
      NativeFile.copyFile(asset.uri, tempPath);
      const rawCode = NativeFile.readFile(tempPath);
      NativeFile.unlink(tempPath);

      const parsed = extractPluginMetadata(rawCode);
      if (parsed.kind === 'invalid') {
        showToast(
          getString(rejectionMessageKey[parsed.reason], { name: asset.name }),
        );
        return;
      }

      const { metadata } = parsed;
      const lang = metadata.lang
        ? normalizePluginLang(metadata.lang)
        : normalizePluginLang(languagesFilter[0] ?? 'en');
      const plugin: PluginItem = {
        id: metadata.id,
        name: metadata.name,
        site: metadata.site,
        lang,
        version: metadata.version,
        url: '',
        iconUrl: pluginIconUrl(metadata.icon),
        hasSettings: false,
      };

      // Same location installPlugin writes to, so backup/restore pick it up.
      const pluginDir = `${PLUGIN_STORAGE}/${plugin.id}`;
      NativeFile.mkdir(pluginDir);
      NativeFile.writeFile(`${pluginDir}/index.js`, rawCode);

      const installed = getMMKVObject<PluginItem[]>(INSTALLED_PLUGINS) ?? [];
      const alreadyImported = installed.some(item => item.id === plugin.id);
      setMMKVObject(
        INSTALLED_PLUGINS,
        alreadyImported
          ? installed.map(item => (item.id === plugin.id ? plugin : item))
          : [...installed, plugin],
      );

      // Re-reads INSTALLED_PLUGINS and re-runs the language filter, so the
      // new entry shows up in the Installed tab immediately.
      await refreshPlugins();
      showToast(
        alreadyImported
          ? getString('browseScreen.updatedTo', { version: metadata.version })
          : getString('browseScreen.installedPlugin', { name: metadata.name }),
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }, [refreshPlugins, languagesFilter]);
};
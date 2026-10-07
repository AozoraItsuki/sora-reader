import { z } from 'zod';

/**
 * Metadata for a plugin picked from a local .js file.
 *
 * The file is evaluated with the same wrapper the plugins-repo manifest
 * builder uses — `Function('require', 'module', …)` reading `exports.default`,
 * with a recursive proxy standing in for `require` — so module-level code runs
 * without the app's package map. Everything downstream receives this parsed,
 * typed value instead of raw file contents.
 */

const pluginMetadataSchema = z.object({
  // `id` becomes a directory name under PLUGIN_STORAGE, so it may not contain
  // path separators or resolve to a parent directory.
  id: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_][A-Za-z0-9._-]*$/),
  name: z.string().trim().min(1),
  site: z.string().trim().min(1),
  version: z.string().trim().min(1),
  lang: z.string().optional().catch(undefined),
  icon: z.string().optional().catch(undefined),
});

export type PluginMetadata = z.infer<typeof pluginMetadataSchema>;

/** Why a picked file was not accepted as a plugin. */
export type PluginMetadataRejection = 'missingDefaultExport' | 'missingFields';

export type PluginMetadataResult =
  | { readonly kind: 'valid'; readonly metadata: PluginMetadata }
  | { readonly kind: 'invalid'; readonly reason: PluginMetadataRejection };

const PLUGIN_ICON_BASE =
  'https://raw.githubusercontent.com/AozoraItsuki/sorareader-plugins/refs/heads/main/public/static';

/**
 * Mirrors the manifest builder's `iconUrl` — the plugin's own icon filename
 * served from the repository's static folder, falling back to the same
 * `siteNotAvailable.png` a repository-installed plugin without an icon gets.
 */
export const pluginIconUrl = (icon?: string): string =>
  `${PLUGIN_ICON_BASE}/${icon || 'siteNotAvailable.png'}`;

/**
 * Resolves any module path to a proxy, mirroring the plugins-repo manifest
 * builder's `_require` — imports at module scope cannot crash metadata
 * extraction, they just yield stand-ins.
 */
const createRecursiveProxy = (): Record<PropertyKey, unknown> => {
  const target: Record<PropertyKey, unknown> = {};
  const handler: ProxyHandler<Record<PropertyKey, unknown>> = {
    get(t, prop) {
      if (prop === 'get') {
        return (value: unknown) => value;
      }
      if (!t[prop]) {
        t[prop] = createRecursiveProxy();
      }
      return t[prop];
    },
  };
  return new Proxy(target, handler);
};

const evaluateDefaultExport = (rawCode: string): unknown => {
  /* eslint no-new-func: "off" */
  const requireProxy = () => createRecursiveProxy();
  return Function(
    'require',
    'module',
    `const exports = module.exports = {};
    ${rawCode};
    return exports.default`,
  )(requireProxy, {});
};

/**
 * Evaluates a picked .js file and returns its validated plugin metadata.
 * Pure — no storage, no navigation — so it can be unit tested directly.
 */
export const extractPluginMetadata = (
  rawCode: string,
): PluginMetadataResult => {
  let exported: unknown;
  try {
    exported = evaluateDefaultExport(rawCode);
  } catch {
    // Any evaluation failure (syntax error, top-level throw, unreadable
    // module) means the file cannot act as a plugin — all map to one
    // rejection. no-excuse-ok: catch
    return { kind: 'invalid', reason: 'missingDefaultExport' };
  }
  if (typeof exported !== 'object' || exported === null) {
    return { kind: 'invalid', reason: 'missingDefaultExport' };
  }
  const parsed = pluginMetadataSchema.safeParse(exported);
  if (!parsed.success) {
    return { kind: 'invalid', reason: 'missingFields' };
  }
  return { kind: 'valid', metadata: parsed.data };
};

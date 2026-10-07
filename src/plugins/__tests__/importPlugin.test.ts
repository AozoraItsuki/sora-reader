import { extractPluginMetadata, pluginIconUrl } from '../helpers/importPlugin';

describe('extractPluginMetadata', () => {
  it('extracts metadata from a compiled plugin exporting a class instance', () => {
    const code = `
      class TestPlugin {
        id = 'TEST';
        name = 'Test Plugin';
        site = 'https://example.com/';
        version = '1.2.3';
        lang = 'Bahasa Indonesia';
        icon = 'test.png';
      }
      module.exports.default = new TestPlugin();
    `;

    expect(extractPluginMetadata(code)).toEqual({
      kind: 'valid',
      metadata: {
        id: 'TEST',
        name: 'Test Plugin',
        site: 'https://example.com/',
        version: '1.2.3',
        lang: 'Bahasa Indonesia',
        icon: 'test.png',
      },
    });
  });

  it('accepts a plugin without optional lang/icon and ignores non-string ones', () => {
    const code = `
      module.exports.default = {
        id: 'NoLang',
        name: 'No Lang Plugin',
        site: 'https://example.com/',
        version: '2.0.0',
        lang: 42,
        icon: null,
      };
    `;

    expect(extractPluginMetadata(code)).toEqual({
      kind: 'valid',
      metadata: {
        id: 'NoLang',
        name: 'No Lang Plugin',
        site: 'https://example.com/',
        version: '2.0.0',
      },
    });
  });

  it('lets module-level require() calls resolve through the proxy', () => {
    const code = `
      const { fetchApi } = require('@libs/fetch');
      module.exports.default = {
        id: 'WithRequire',
        name: 'Requires Fetch',
        site: 'https://example.com/',
        version: '1.0.0',
      };
    `;

    expect(extractPluginMetadata(code).kind).toBe('valid');
  });

  it('rejects code without a default export', () => {
    expect(extractPluginMetadata('const answer = 42;')).toEqual({
      kind: 'invalid',
      reason: 'missingDefaultExport',
    });
  });

  it('rejects code that fails to evaluate', () => {
    const syntaxError = 'class {{{';
    const topLevelThrow = `throw new Error('boom');`;

    expect(extractPluginMetadata(syntaxError)).toEqual({
      kind: 'invalid',
      reason: 'missingDefaultExport',
    });
    expect(extractPluginMetadata(topLevelThrow)).toEqual({
      kind: 'invalid',
      reason: 'missingDefaultExport',
    });
  });

  it('rejects a default export missing required fields', () => {
    const code = `
      module.exports.default = {
        id: 'Incomplete',
        name: 'Missing Site',
        version: '1.0.0',
      };
    `;

    expect(extractPluginMetadata(code)).toEqual({
      kind: 'invalid',
      reason: 'missingFields',
    });
  });

  it('rejects required fields of the wrong type', () => {
    const code = `
      module.exports.default = {
        id: 'BadType',
        name: 'Version Number',
        site: 'https://example.com/',
        version: 3,
      };
    `;

    expect(extractPluginMetadata(code)).toEqual({
      kind: 'invalid',
      reason: 'missingFields',
    });
  });

  it('rejects ids that would escape the plugin storage directory', () => {
    const code = `
      module.exports.default = {
        id: '../escape',
        name: 'Path Traversal',
        site: 'https://example.com/',
        version: '1.0.0',
      };
    `;

    expect(extractPluginMetadata(code)).toEqual({
      kind: 'invalid',
      reason: 'missingFields',
    });
  });
});

describe('pluginIconUrl', () => {
  it('falls back to the shared placeholder when no icon is set', () => {
    expect(pluginIconUrl()).toBe(
      'https://raw.githubusercontent.com/AozoraItsuki/sorareader-plugins/refs/heads/main/public/static/siteNotAvailable.png',
    );
    expect(pluginIconUrl('')).toBe(
      'https://raw.githubusercontent.com/AozoraItsuki/sorareader-plugins/refs/heads/main/public/static/siteNotAvailable.png',
    );
  });

  it('appends the plugin icon filename to the static folder', () => {
    expect(pluginIconUrl('test.png')).toBe(
      'https://raw.githubusercontent.com/AozoraItsuki/sorareader-plugins/refs/heads/main/public/static/test.png',
    );
  });
});

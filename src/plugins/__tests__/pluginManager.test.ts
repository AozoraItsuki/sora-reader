import { getRepositoriesFromDb } from '@database/queries/RepositoryQueries';

import { fetchPlugins } from '../pluginManager';

jest.mock('@database/queries/RepositoryQueries', () => ({
  getRepositoriesFromDb: jest.fn(),
}));

jest.mock('@hooks/persisted/useDisabledRepositories', () => ({
  DISABLED_REPOSITORIES: 'DISABLED_REPOSITORIES',
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@hooks/persisted/useUserAgent', () => ({
  CUSTOM_USER_AGENT: 'CUSTOM_USER_AGENT',
  getUserAgent: jest.fn(() => 'test-agent'),
}));

jest.mock('@utils/mmkv/mmkv', () => ({
  MMKVStorage: {
    getString: jest.fn(() => undefined),
    set: jest.fn(),
    remove: jest.fn(),
  },
  getMMKVObject: jest.fn(() => undefined),
  setMMKVObject: jest.fn(),
}));

jest.mock('@utils/showToast', () => ({
  showToast: jest.fn(),
}));

const manifestItem = (overrides = {}) => ({
  id: 'WTRLAB',
  name: 'WTR-LAB',
  site: 'https://wtr-lab.com/',
  lang: 'Bahasa Indonesia',
  version: '1.7.2',
  url: 'https://example.com/wtrlab.js',
  iconUrl: 'https://example.com/icon.png',
  ...overrides,
});

describe('fetchPlugins language normalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRepositoriesFromDb as jest.Mock).mockResolvedValue([
      { id: 1, url: 'https://example.com/plugins.min.json' },
    ]);
  });

  it('maps full language names from manifests to filter codes', async () => {
    global.fetch = jest.fn(async () => ({
      json: async () => [manifestItem()],
    })) as unknown as typeof fetch;

    const plugins = await fetchPlugins();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].lang).toBe('id');
  });

  it('keeps known language codes untouched', async () => {
    global.fetch = jest.fn(async () => ({
      json: async () => [manifestItem({ id: 'X', lang: 'en' })],
    })) as unknown as typeof fetch;

    const plugins = await fetchPlugins();

    expect(plugins[0].lang).toBe('en');
  });

  it('reverse-lookup is case-insensitive and passes unknowns through', async () => {
    global.fetch = jest.fn(async () => ({
      json: async () => [
        manifestItem({ id: 'A', lang: 'bahasa indonesia' }),
        manifestItem({ id: 'B', lang: 'Klingon' }),
      ],
    })) as unknown as typeof fetch;

    const plugins = await fetchPlugins();
    const byId = Object.fromEntries(plugins.map(p => [p.id, p.lang]));

    expect(byId.A).toBe('id');
    expect(byId.B).toBe('Klingon');
  });
});

import { defaultCover } from '@plugins/helpers/constants';
import { render } from '@testing-library/react-native';
import { ThemeColors } from '@theme/types';
import React from 'react';

import ListView from '../ListView';

jest.mock('@plugins/local/localServerManager', () => ({
  getLocalServerUrl: jest.fn(() => ''),
}));
jest.mock('@hooks/persisted/useUserAgent', () => ({
  getUserAgent: jest.fn(() => 'test-agent'),
}));
jest.mock('@services/saf/safFile', () => ({
  getDirectRootAbsolute: jest.fn(() => null),
}));

const { getDirectRootAbsolute } = jest.requireMock('@services/saf/safFile') as {
  getDirectRootAbsolute: jest.Mock;
};

type JsonNode = {
  type: string;
  props: { source?: { uri?: string }; onError?: unknown };
  children: (JsonNode | string | null)[] | null;
};

const images = (node: JsonNode | string | null): JsonNode[] => {
  if (!node || typeof node === 'string') {
    return [];
  }
  return [
    ...(node.type === 'Image' ? [node] : []),
    ...(node.children ?? []).flatMap(images),
  ];
};

const theme = {
  onSurface: '#000000',
  primary: '#000000',
  rippleColor: '#000000',
} as ThemeColors;
const item = {
  id: 7,
  pluginId: 'updates',
  name: 'Test Novel',
  path: 'Novels/updates/7',
  cover: 'Novels/updates/7/other.png',
};

beforeEach(() => {
  getDirectRootAbsolute.mockReturnValue(null);
});

describe('ListView cover', () => {
  it('never passes a raw tree-relative path to Image', () => {
    const view = render(<ListView item={item} theme={theme} onPress={jest.fn()} />);

    expect(images(view.toJSON())[0].props.source?.uri).toBe(defaultCover);
  });

  it('uses the library row identity for the on-disk cover', () => {
    getDirectRootAbsolute.mockReturnValue('/mock/root');
    const view = render(
      <ListView
        item={{ ...item, cover: null }}
        theme={theme}
        onPress={jest.fn()}
      />,
    );

    const image = images(view.toJSON())[0];
    expect(image.props.source?.uri).toBe(
      'file:///mock/root/Novels/updates/7/cover.png',
    );
    expect(typeof image.props.onError).toBe('function');
  });
});

import { useBrowseSettings, usePlugins } from '@hooks/persisted';
import { getPlugin } from '@plugins/pluginManager';
import { NovelItem, PluginItem } from '@plugins/types';
import { useFocusEffect } from '@react-navigation/native';
import { debounce } from 'lodash-es';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  defaultSearchText?: string;
  hasResultsOnly?: boolean;
}

export interface GlobalSearchResult {
  isLoading: boolean;
  plugin: PluginItem;
  novels: NovelItem[];
  error?: string | null;
}

export const useGlobalSearch = ({
  defaultSearchText,
  hasResultsOnly = false,
}: Props) => {
  const isMounted = useRef(true); // if user closes the search screen, cancel the search
  const isFocused = useRef(true); // if the user opens a sub-screen (e.g. novel screen), pause the search
  const lastSearch = useRef(''); // if the user changes search, cancel running searches
  const pollingWaiters = useRef<
    Set<{ timer?: ReturnType<typeof setTimeout>; resolve: () => void }>
  >(new Set());

  // Polling must resolve even on unmount so the async search loops can exit
  // instead of staying suspended on a timer that can no longer update state.
  const waitForPollingInterval = useCallback(
    () =>
      new Promise<void>(resolve => {
        if (!isMounted.current) {
          resolve();
          return;
        }
        const waiter: {
          timer?: ReturnType<typeof setTimeout>;
          resolve: () => void;
        } = { resolve };
        waiter.timer = setTimeout(() => {
          pollingWaiters.current.delete(waiter);
          resolve();
        }, 100);
        pollingWaiters.current.add(waiter);
      }),
    [],
  );

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      pollingWaiters.current.forEach(({ timer, resolve }) => {
        clearTimeout(timer);
        resolve();
      });
      pollingWaiters.current.clear();
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;

      return () => (isFocused.current = false);
    }, []),
  );

  const { filteredInstalledPlugins } = usePlugins();

  const [searchResults, setSearchResults] = useState<GlobalSearchResult[]>([]);
  const [progress, setProgress] = useState(0);

  const { globalSearchConcurrency = 1 } = useBrowseSettings();

  const globalSearch = useCallback(
    (searchText: string) => {
      if (!isMounted.current || lastSearch.current === searchText) {
        return;
      }
      lastSearch.current = searchText;
      const defaultResult: GlobalSearchResult[] = filteredInstalledPlugins.map(
        plugin => ({
          isLoading: true,
          plugin,
          novels: [],
          error: null,
        }),
      );

      setSearchResults(defaultResult.sort(novelResultSorter));
      setProgress(0);

      let running = 0;

      async function searchInPlugin(_plugin: PluginItem) {
        try {
          const plugin = getPlugin(_plugin.id);
          if (!plugin) {
            throw new Error(`Unknown plugin: ${_plugin.id}`);
          }
          const res = await plugin.searchNovels(searchText, 1);

          if (!isMounted.current) {
            return;
          }
          setSearchResults(prevState =>
            prevState
              .map(prevResult =>
                prevResult.plugin.id === plugin.id
                  ? { ...prevResult, novels: res, isLoading: false }
                  : { ...prevResult },
              )
              .sort(novelResultSorter),
          );
        } catch (error: any) {
          if (!isMounted.current) {
            return;
          }
          const errorMessage = error?.message || String(error);
          setSearchResults(prevState =>
            prevState
              .map(prevResult =>
                prevResult.plugin.id === _plugin.id
                  ? {
                      ...prevResult,
                      novels: [],
                      isLoading: false,
                      error: errorMessage,
                    }
                  : { ...prevResult },
              )
              .sort(novelResultSorter),
          );
        }
      }

      // Sort so we load the plugins results in the same order as they show on the list
      const filteredSortedInstalledPlugins = [...filteredInstalledPlugins].sort(
        (a, b) => a.name.localeCompare(b.name),
      );

      (async () => {
        if (!isMounted.current) {
          return;
        }
        if (globalSearchConcurrency > 1) {
          for (const _plugin of filteredSortedInstalledPlugins) {
            while (
              isMounted.current &&
              (running >= globalSearchConcurrency || !isFocused.current)
            ) {
              await waitForPollingInterval();
            }
            if (!isMounted.current || lastSearch.current !== searchText) {
              break;
            }
            running++;
            searchInPlugin(_plugin)
              .then(() => {
                running--;
                if (isMounted.current && lastSearch.current === searchText) {
                  setProgress(
                    prevState =>
                      prevState + 1 / filteredInstalledPlugins.length,
                  );
                }
              })
              .catch(() => {
                running--;
              });
          }
        } else {
          for (const _plugin of filteredSortedInstalledPlugins) {
            if (!isMounted.current || lastSearch.current !== searchText) {
              break;
            }
            while (isMounted.current && !isFocused.current) {
              await waitForPollingInterval();
            }
            if (!isMounted.current || lastSearch.current !== searchText) {
              break;
            }
            await searchInPlugin(_plugin);
            if (isMounted.current && lastSearch.current === searchText) {
              setProgress(
                prevState => prevState + 1 / filteredInstalledPlugins.length,
              );
            }
          }
        }
      })();
    },
    [filteredInstalledPlugins, globalSearchConcurrency, waitForPollingInterval],
  );

  const debouncedGlobalSearch = useMemo(
    () => debounce(globalSearch, 300),
    [globalSearch],
  );

  useEffect(() => {
    if (defaultSearchText) {
      debouncedGlobalSearch(defaultSearchText);
    }

    return () => {
      debouncedGlobalSearch.cancel();
    };
  }, [defaultSearchText, debouncedGlobalSearch]);

  const filteredSearchResults = useMemo(() => {
    if (!hasResultsOnly) {
      return searchResults;
    }
    return searchResults.filter(
      result => !result.isLoading && !result.error && result.novels.length > 0,
    );
  }, [searchResults, hasResultsOnly]);

  return { searchResults: filteredSearchResults, globalSearch, progress };
};

function novelResultSorter(
  { novels: a, plugin: { name: aName } }: GlobalSearchResult,
  { novels: b, plugin: { name: bName } }: GlobalSearchResult,
) {
  if (!a.length && !b.length) {
    return aName.localeCompare(bName);
  }
  if (!a.length) {
    return 1;
  }
  if (!b.length) {
    return -1;
  }

  return aName.localeCompare(bName);
}

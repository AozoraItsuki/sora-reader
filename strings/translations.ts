import * as Localization from 'expo-localization';
import dayjs from 'dayjs';
import { I18n, TranslateOptions } from 'i18n-js';
import { MMKVStorage } from '@utils/mmkv/mmkv';

import customParseFormat from 'dayjs/plugin/customParseFormat';
import localeData from 'dayjs/plugin/localeData';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import relativeTime from 'dayjs/plugin/relativeTime';
import calendar from 'dayjs/plugin/calendar';
dayjs.extend(customParseFormat);
dayjs.extend(localeData);
dayjs.extend(localizedFormat);
dayjs.extend(relativeTime);
dayjs.extend(calendar);

import 'dayjs/locale/id';

import en from './languages/en/strings.json';
import id from './languages/id_ID/strings.json';

import { StringMap } from './types';
import { showToast } from '@utils/showToast';

const i18n = new I18n({
  en,
  id,
});
i18n.defaultLocale = 'en';
i18n.enableFallback = true;

const getSavedLocale = (): string => {
  try {
    return MMKVStorage.getString('APP_LOCALE') || '';
  } catch {
    return '';
  }
};

const getDayjsLocale = (locale: string): string => {
  const localeMap: Record<string, string> = {
    id: 'id',
  };
  return localeMap[locale] || locale;
};

const savedLocale = getSavedLocale();
const detectedLocale =
  savedLocale ||
  Localization.getLocales()[0]?.languageTag ||
  i18n.defaultLocale;

i18n.locale = detectedLocale;
dayjs.locale(getDayjsLocale(detectedLocale));

export const localization = detectedLocale;

export const setLocale = (locale: string) => {
  try {
    MMKVStorage.set('APP_LOCALE', locale);
  } catch (error) {
    showToast(`Failed to set locale: ${error}`);
  }
};

export { i18n };

export const getString = (
  stringKey: keyof StringMap,
  options?: TranslateOptions,
) => i18n.t(stringKey, options);

// @ts-expect-error
dayjs.Ls[dayjs.locale()].calendar = {
  sameDay: getString('date.calendar.sameDay'),
  nextDay: getString('date.calendar.nextDay'),
  nextWeek: 'dddd',
  lastDay: getString('date.calendar.lastDay'),
  lastWeek: getString('date.calendar.lastWeek'),
  sameElse: 'LL',
};

import BottomSheet from '@components/BottomSheet/BottomSheet';
import { Checkbox } from '@components/Checkbox/Checkbox';
import { Button, Menu } from '@components/index';
import Switch from '@components/Switch/Switch';
import {
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useBoolean } from '@hooks';
import { useTheme } from '@hooks/persisted';
import {
  FilterOption,
  Filters,
  FilterToValues,
  FilterTypes,
} from '@plugins/types/filterTypes';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { overlay, TextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getValueFor } from './filterUtils';

const insertOrRemoveIntoArray = (array: string[], val: string): string[] =>
  array.indexOf(val) > -1 ? array.filter(ele => ele !== val) : [...array, val];

const LARGE_OPTIONS_THRESHOLD = 20;

type SelectedFilters = FilterToValues<Filters>;

type OnFilterChange = (key: string, value: SelectedFilters[string]) => void;

interface FilterOptionsModalProps {
  visible: boolean;
  onDismiss: () => void;
  filter: Filters[string];
  filterKey: string;
  filterValue: SelectedFilters[string] | undefined;
  onFilterChange: OnFilterChange;
  theme: ThemeColors;
}

const FilterOptionsModal: React.FC<FilterOptionsModalProps> = ({
  visible,
  onDismiss,
  filter,
  filterKey,
  filterValue,
  onFilterChange,
  theme,
}) => {
  const [search, setSearch] = useState('');
  const { top } = useSafeAreaInsets();

  const resolvedValue =
    filterValue ??
    ({ type: filter.type, value: filter.value } as SelectedFilters[string]);

  const options = 'options' in filter ? filter.options : [];

  const sortedFiltered = useMemo<ReadonlyArray<FilterOption>>(() => {
    const sorted = [...options].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(opt => opt.label.toLowerCase().includes(q));
  }, [options, search]);

  const renderOption = useCallback(
    ({ item }: { item: FilterOption }) => {
      if (filter.type === FilterTypes.Picker) {
        const value = getValueFor<typeof FilterTypes.Picker>(
          filter as any,
          resolvedValue,
        );
        const isSelected = value === item.value;
        return (
          <Pressable
            style={[
              styles.optionItem,
              isSelected && { backgroundColor: theme.surfaceVariant },
            ]}
            onPress={() => {
              onFilterChange(filterKey, {
                value: item.value,
                type: FilterTypes.Picker,
              });
              onDismiss();
            }}
            android_ripple={{ color: theme.rippleColor }}
          >
            <Text style={[styles.optionLabel, { color: theme.onSurface }]}>
              {item.label}
            </Text>
            {isSelected && (
              <MaterialCommunityIcons
                name="check"
                size={20}
                color={theme.primary}
              />
            )}
          </Pressable>
        );
      }
      if (filter.type === FilterTypes.CheckboxGroup) {
        const value = getValueFor<typeof FilterTypes.CheckboxGroup>(
          filter as any,
          resolvedValue,
        );
        return (
          <Checkbox
            label={item.label}
            theme={theme}
            status={value.includes(item.value)}
            onPress={() =>
              onFilterChange(filterKey, {
                type: FilterTypes.CheckboxGroup,
                value: insertOrRemoveIntoArray(value, item.value),
              })
            }
          />
        );
      }
      if (filter.type === FilterTypes.ExcludableCheckboxGroup) {
        const value = getValueFor<typeof FilterTypes.ExcludableCheckboxGroup>(
          filter as any,
          resolvedValue,
        );
        const status = value.include?.includes(item.value)
          ? true
          : value.exclude?.includes(item.value)
          ? 'indeterminate'
          : false;
        return (
          <Checkbox
            label={item.label}
            theme={theme}
            status={status}
            onPress={() => {
              if (value.exclude?.includes(item.value)) {
                onFilterChange(filterKey, {
                  type: FilterTypes.ExcludableCheckboxGroup,
                  value: {
                    include: [...(value.include || [])],
                    exclude: [
                      ...(value.exclude?.filter(f => f !== item.value) || []),
                    ],
                  },
                });
              } else if (value.include?.includes(item.value)) {
                onFilterChange(filterKey, {
                  type: FilterTypes.ExcludableCheckboxGroup,
                  value: {
                    include: [
                      ...(value.include?.filter(f => f !== item.value) || []),
                    ],
                    exclude: [...(value.exclude || []), item.value],
                  },
                });
              } else {
                onFilterChange(filterKey, {
                  type: FilterTypes.ExcludableCheckboxGroup,
                  value: {
                    include: [...(value.include || []), item.value],
                    exclude: value.exclude,
                  },
                });
              }
            }}
          />
        );
      }
      return null;
    },
    [filter, filterKey, resolvedValue, onFilterChange, onDismiss, theme],
  );

  return (
    <Modal
      visible={visible}
      onRequestClose={onDismiss}
      animationType="slide"
      statusBarTranslucent
    >
      <View
        style={[
          styles.modalContainer,
          { backgroundColor: theme.background, paddingTop: top },
        ]}
      >
        <View style={styles.modalHeader}>
          <Pressable
            onPress={onDismiss}
            style={styles.modalBackBtn}
            android_ripple={{ color: theme.rippleColor, radius: 20 }}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={theme.onBackground}
            />
          </Pressable>
          <Text style={[styles.modalTitle, { color: theme.onBackground }]}>
            {filter.label}
          </Text>
        </View>
        <View style={styles.modalSearchContainer}>
          <TextInput
            mode="outlined"
            placeholder={getString('common.search')}
            value={search}
            onChangeText={setSearch}
            theme={{ colors: { background: 'transparent' } }}
            outlineColor={theme.outline}
            textColor={theme.onSurface}
            left={
              <TextInput.Icon
                icon="magnify"
                color={() => theme.onSurfaceVariant}
              />
            }
            right={
              search ? (
                <TextInput.Icon
                  icon="close"
                  onPress={() => setSearch('')}
                  color={() => theme.onSurfaceVariant}
                />
              ) : null
            }
            style={styles.modalSearchInput}
          />
        </View>
        <FlatList
          data={sortedFiltered}
          keyExtractor={item => item.value}
          renderItem={renderOption}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    </Modal>
  );
};

interface FilterItemProps {
  theme: ThemeColors;
  filter: Filters[string];
  filterKey: string;
  filterValue: SelectedFilters[string] | undefined;
  onFilterChange: OnFilterChange;
}

const FilterItem: React.FC<FilterItemProps> = memo(
  ({ theme, filter, filterKey, filterValue, onFilterChange }) => {
    const {
      value: isVisible,
      toggle: toggleCard,
      setFalse: closeCard,
    } = useBoolean();
    const { width: screenWidth } = useWindowDimensions();
    const [modalVisible, setModalVisible] = useState(false);

    // Fallback to filter's default value when selectedFilters doesn't have this key
    const resolvedValue =
      filterValue ??
      ({ type: filter.type, value: filter.value } as SelectedFilters[string]);

    // Must be called unconditionally (rules of hooks)
    const pickerContentStyle = useMemo(
      () => ({ backgroundColor: theme.surfaceVariant }),
      [theme.surfaceVariant],
    );

    if (filter.type === FilterTypes.TextInput) {
      const value = getValueFor<(typeof filter)['type']>(filter, resolvedValue);
      return (
        <View style={styles.textContainer}>
          <TextInput
            render={props => <BottomSheetTextInput {...(props as any)} />}
            style={[styles.flex, { width: screenWidth - 48 }]}
            mode="outlined"
            label={
              <Text
                style={[
                  {
                    color: theme.onSurface,
                    backgroundColor: overlay(2, theme.surface),
                  },
                ]}
              >
                {` ${filter.label} `}
              </Text>
            }
            defaultValue={value}
            theme={{ colors: { background: 'transparent' } }}
            outlineColor={theme.onSurface}
            textColor={theme.onSurface}
            onChangeText={text =>
              onFilterChange(filterKey, {
                value: text,
                type: FilterTypes.TextInput,
              })
            }
          />
        </View>
      );
    }
    if (filter.type === FilterTypes.Picker) {
      const value = getValueFor<(typeof filter)['type']>(filter, resolvedValue);
      const label =
        filter.options.find(option => option.value === value)?.label ||
        'whatever';

      if (filter.options.length > LARGE_OPTIONS_THRESHOLD) {
        return (
          <View style={styles.pickerContainer}>
            <Pressable
              style={[styles.flex, { width: screenWidth - 48 }]}
              onPress={() => setModalVisible(true)}
            >
              <TextInput
                mode="outlined"
                label={
                  <Text
                    style={[
                      {
                        color: theme.onSurface,
                        backgroundColor: overlay(2, theme.surface),
                      },
                    ]}
                  >
                    {` ${filter.label} `}
                  </Text>
                }
                value={label}
                editable={false}
                theme={{ colors: { background: 'transparent' } }}
                outlineColor={theme.onSurface}
                textColor={theme.onSurface}
                right={
                  <TextInput.Icon
                    icon="chevron-right"
                    color={() => theme.onSurfaceVariant}
                  />
                }
              />
            </Pressable>
            <FilterOptionsModal
              visible={modalVisible}
              onDismiss={() => setModalVisible(false)}
              filter={filter}
              filterKey={filterKey}
              filterValue={filterValue}
              onFilterChange={onFilterChange}
              theme={theme}
            />
          </View>
        );
      }

      return (
        <View style={styles.pickerContainer}>
          <Menu
            fullWidth
            visible={isVisible}
            contentStyle={pickerContentStyle}
            anchor={
              <Pressable
                style={[styles.flex, { width: screenWidth - 48 }]}
                onPress={toggleCard}
              >
                <TextInput
                  mode="outlined"
                  label={
                    <Text
                      style={[
                        {
                          color: isVisible ? theme.primary : theme.onSurface,
                          backgroundColor: overlay(2, theme.surface),
                        },
                      ]}
                    >
                      {` ${filter.label} `}
                    </Text>
                  }
                  value={label}
                  editable={false}
                  theme={{ colors: { background: 'transparent' } }}
                  outlineColor={isVisible ? theme.primary : theme.onSurface}
                  textColor={isVisible ? theme.primary : theme.onSurface}
                />
              </Pressable>
            }
            onDismiss={closeCard}
          >
            {filter.options.map(val => {
              return (
                <Menu.Item
                  key={val.label}
                  title={val.label}
                  titleStyle={{ color: theme.onSurfaceVariant }}
                  onPress={() => {
                    closeCard();
                    onFilterChange(filterKey, {
                      value: val.value,
                      type: FilterTypes.Picker,
                    });
                  }}
                />
              );
            })}
          </Menu>
        </View>
      );
    }
    if (filter.type === FilterTypes.CheckboxGroup) {
      const value = getValueFor<(typeof filter)['type']>(filter, resolvedValue);

      if (filter.options.length > LARGE_OPTIONS_THRESHOLD) {
        const selectedCount = value.length;
        return (
          <View>
            <Pressable
              style={styles.checkboxHeader}
              onPress={() => setModalVisible(true)}
              android_ripple={{ color: theme.rippleColor }}
            >
              <Text style={[{ color: theme.onSurfaceVariant }]}>
                {filter.label}
              </Text>
              <View style={styles.badgeRow}>
                {selectedCount > 0 && (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: theme.primary },
                    ]}
                  >
                    <Text
                      style={[styles.badgeText, { color: theme.onPrimary }]}
                    >
                      {selectedCount}
                    </Text>
                  </View>
                )}
                <MaterialCommunityIcons
                  name="chevron-right"
                  color={theme.onSurface}
                  size={24}
                />
              </View>
            </Pressable>
            <FilterOptionsModal
              visible={modalVisible}
              onDismiss={() => setModalVisible(false)}
              filter={filter}
              filterKey={filterKey}
              filterValue={filterValue}
              onFilterChange={onFilterChange}
              theme={theme}
            />
          </View>
        );
      }

      return (
        <View>
          <Pressable
            style={styles.checkboxHeader}
            onPress={toggleCard}
            android_ripple={{ color: theme.rippleColor }}
          >
            <Text style={[{ color: theme.onSurfaceVariant }]}>
              {filter.label}
            </Text>
            <MaterialCommunityIcons
              name={isVisible ? 'chevron-up' : 'chevron-down'}
              color={theme.onSurface}
              size={24}
            />
          </Pressable>
          {isVisible
            ? filter.options.map(val => {
                return (
                  <Checkbox
                    key={val.label}
                    label={val.label}
                    theme={theme}
                    status={value.includes(val.value)}
                    onPress={() =>
                      onFilterChange(filterKey, {
                        type: FilterTypes.CheckboxGroup,
                        value: insertOrRemoveIntoArray(value, val.value),
                      })
                    }
                  />
                );
              })
            : null}
        </View>
      );
    }
    if (filter.type === FilterTypes.Switch) {
      const value = getValueFor<(typeof filter)['type']>(filter, resolvedValue);
      return (
        <Pressable
          android_ripple={{ color: theme.rippleColor }}
          style={styles.container}
          onPress={() => {
            onFilterChange(filterKey, {
              value: !value,
              type: FilterTypes.Switch,
            });
          }}
        >
          <View style={styles.switchContainer}>
            <View style={styles.switchLabelContainer}>
              <Text style={[{ color: theme.onSurface }, styles.switchLabel]}>
                {filter.label}
              </Text>
            </View>
            <Switch
              value={value}
              onValueChange={() => {
                onFilterChange(filterKey, {
                  value: !value,
                  type: FilterTypes.Switch,
                });
              }}
            />
          </View>
        </Pressable>
      );
    }
    if (filter.type === FilterTypes.ExcludableCheckboxGroup) {
      const value = getValueFor<(typeof filter)['type']>(filter, resolvedValue);

      if (filter.options.length > LARGE_OPTIONS_THRESHOLD) {
        const includedCount = value.include?.length ?? 0;
        const excludedCount = value.exclude?.length ?? 0;
        const totalSelected = includedCount + excludedCount;
        return (
          <View>
            <Pressable
              style={styles.checkboxHeader}
              onPress={() => setModalVisible(true)}
              android_ripple={{ color: theme.rippleColor }}
            >
              <Text style={[{ color: theme.onSurfaceVariant }]}>
                {filter.label}
              </Text>
              <View style={styles.badgeRow}>
                {totalSelected > 0 && (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: theme.primary },
                    ]}
                  >
                    <Text
                      style={[styles.badgeText, { color: theme.onPrimary }]}
                    >
                      {totalSelected}
                    </Text>
                  </View>
                )}
                <MaterialCommunityIcons
                  name="chevron-right"
                  color={theme.onSurface}
                  size={24}
                />
              </View>
            </Pressable>
            <FilterOptionsModal
              visible={modalVisible}
              onDismiss={() => setModalVisible(false)}
              filter={filter}
              filterKey={filterKey}
              filterValue={filterValue}
              onFilterChange={onFilterChange}
              theme={theme}
            />
          </View>
        );
      }

      return (
        <View>
          <Pressable
            style={styles.checkboxHeader}
            onPress={toggleCard}
            android_ripple={{ color: theme.rippleColor }}
          >
            <Text style={[{ color: theme.onSurfaceVariant }]}>
              {filter.label}
            </Text>
            <MaterialCommunityIcons
              name={isVisible ? 'chevron-up' : 'chevron-down'}
              color={theme.onSurface}
              size={24}
            />
          </Pressable>
          {isVisible
            ? filter.options.map(val => {
                return (
                  <Checkbox
                    key={val.label}
                    label={val.label}
                    theme={theme}
                    status={
                      value.include?.includes(val.value)
                        ? true
                        : value.exclude?.includes(val.value)
                        ? 'indeterminate'
                        : false
                    }
                    onPress={() => {
                      if (value.exclude?.includes(val.value)) {
                        onFilterChange(filterKey, {
                          type: FilterTypes.ExcludableCheckboxGroup,
                          value: {
                            include: [...(value.include || [])],
                            exclude: [
                              ...(value.exclude?.filter(
                                f => f !== val.value,
                              ) || []),
                            ],
                          },
                        });
                      } else if (value.include?.includes(val.value)) {
                        onFilterChange(filterKey, {
                          type: FilterTypes.ExcludableCheckboxGroup,
                          value: {
                            include: [
                              ...(value.include?.filter(
                                f => f !== val.value,
                              ) || []),
                            ],
                            exclude: [...(value.exclude || []), val.value],
                          },
                        });
                      } else {
                        onFilterChange(filterKey, {
                          type: FilterTypes.ExcludableCheckboxGroup,
                          value: {
                            include: [...(value.include || []), val.value],
                            exclude: value.exclude,
                          },
                        });
                      }
                    }}
                  />
                );
              })
            : null}
        </View>
      );
    }
    return <></>;
  },
);

interface BottomSheetProps {
  filterSheetRef: React.RefObject<BottomSheetModal | null>;
  filters: Filters;
  setFilters: (filters?: SelectedFilters) => void;
  clearFilters: (filters: Filters) => void;
}

const FilterBottomSheet: React.FC<BottomSheetProps> = ({
  filters,
  filterSheetRef,
  clearFilters,
  setFilters,
}) => {
  const theme = useTheme();
  const { bottom } = useSafeAreaInsets();
  const [selectedFilters, setSelectedFilters] =
    useState<SelectedFilters>(filters);

  // Stable callback for individual filter changes — prevents cascading re-renders
  const handleFilterChange: OnFilterChange = useCallback((key, value) => {
    setSelectedFilters(prev => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  // Memoize the data array to prevent FlatList from re-rendering on every parent render
  const filterEntries = useMemo(
    () =>
      filters ? (Object.entries(filters) as [string, Filters[string]][]) : [],
    [filters],
  );

  const renderItem = useCallback(
    ({ item }: { item: [string, Filters[string]] }) => (
      <FilterItem
        theme={theme}
        filter={item[1]}
        filterKey={item[0]}
        filterValue={selectedFilters[item[0]]}
        onFilterChange={handleFilterChange}
      />
    ),
    [theme, selectedFilters, handleFilterChange],
  );

  const handleReset = useCallback(() => {
    setSelectedFilters(filters);
    clearFilters(filters);
  }, [filters, clearFilters]);

  const handleApply = useCallback(() => {
    setFilters(selectedFilters);
    filterSheetRef?.current?.close();
  }, [setFilters, selectedFilters, filterSheetRef]);

  const borderStyle = useMemo(
    () => [styles.buttonContainer, { borderBottomColor: theme.outline }],
    [theme.outline],
  );

  return (
    <BottomSheet
      bottomSheetRef={filterSheetRef}
      snapPoints={[400, 600]}
      bottomInset={bottom}
      handleComponent={null}
      children={
        <View style={styles.flex}>
          <View style={borderStyle}>
            <Button title={getString('common.reset')} onPress={handleReset} />
            <Button
              title={getString('common.filter')}
              textColor={theme.onPrimary}
              onPress={handleApply}
              mode="contained"
            />
          </View>
          <BottomSheetFlatList
            data={filterEntries}
            keyExtractor={(item: [string, Filters[string]]) =>
              'filter' + item[0]
            }
            renderItem={renderItem}
          />
        </View>
      }
    />
  );
};

export default FilterBottomSheet;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  transparent: {
    backgroundColor: 'transparent',
  },
  buttonContainer: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  checkboxHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  container: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    flex: 1,
  },
  picker: {
    paddingHorizontal: 24,
    width: 200,
  },
  pickerContainer: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
    paddingHorizontal: 24,
  },
  switchContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
    paddingHorizontal: 24,
  },
  switchLabel: {
    fontSize: 16,
  },
  switchLabelContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
    paddingHorizontal: 24,
  },
  badgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    borderRadius: 10,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  modalBackBtn: {
    borderRadius: 20,
    padding: 8,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  modalSearchContainer: {
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  modalSearchInput: {
    fontSize: 14,
  },
  optionItem: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  optionLabel: {
    flex: 1,
    fontSize: 15,
  },
});

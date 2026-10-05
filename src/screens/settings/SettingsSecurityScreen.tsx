import { Appbar, List, Modal, SafeAreaView } from '@components';
import { useBoolean } from '@hooks';
import { useTheme } from '@hooks/persisted';
import { useSecuritySettings } from '@hooks/persisted/useSettings';
import { getString } from '@strings/translations';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Portal } from 'react-native-paper';

const SCREEN_PROTECTION_OPTIONS = [
  { label: 'securitySettingsScreen.always' as const, value: 'always' as const },
  {
    label: 'securitySettingsScreen.incognitoOnly' as const,
    value: 'incognito' as const,
  },
  { label: 'securitySettingsScreen.never' as const, value: 'never' as const },
];

const SettingsSecurityScreen = ({ navigation }: any) => {
  const theme = useTheme();
  const { screenProtection, setSecuritySettings } = useSecuritySettings();

  const {
    value: screenProtModalVisible,
    setTrue: showScreenProtModal,
    setFalse: hideScreenProtModal,
  } = useBoolean();

  const getScreenProtLabel = (): string => {
    const option = SCREEN_PROTECTION_OPTIONS.find(
      o => o.value === screenProtection,
    );
    return option
      ? getString(option.label)
      : getString('securitySettingsScreen.never');
  };

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('securitySettings')}
        handleGoBack={() => navigation.goBack()}
        theme={theme}
      />
      <ScrollView>
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('securitySettingsScreen.privacySection')}
          </List.SubHeader>
          <List.Item
            title={getString('securitySettingsScreen.screenProtection')}
            description={
              getString('securitySettingsScreen.screenProtectionDesc') +
              '\n' +
              getScreenProtLabel()
            }
            onPress={showScreenProtModal}
            theme={theme}
          />
        </List.Section>
      </ScrollView>

      <Portal>
        <Modal visible={screenProtModalVisible} onDismiss={hideScreenProtModal}>
          <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
            {getString('securitySettingsScreen.screenProtection')}
          </Text>
          {SCREEN_PROTECTION_OPTIONS.map(option => (
            <Pressable
              key={option.value}
              style={[styles.radioRow, { borderBottomColor: theme.outline }]}
              android_ripple={{ color: theme.rippleColor }}
              onPress={() => {
                setSecuritySettings({ screenProtection: option.value });
                hideScreenProtModal();
              }}
            >
              <View style={[styles.radioOuter, { borderColor: theme.primary }]}>
                {screenProtection === option.value && (
                  <View
                    style={[
                      styles.radioInner,
                      { backgroundColor: theme.primary },
                    ]}
                  />
                )}
              </View>
              <Text style={[styles.radioText, { color: theme.onSurface }]}>
                {getString(option.label)}
              </Text>
            </Pressable>
          ))}
        </Modal>
      </Portal>
    </SafeAreaView>
  );
};

export default SettingsSecurityScreen;

const styles = StyleSheet.create({
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  radioInner: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  radioOuter: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioRow: {
    alignItems: 'center',
    borderBottomWidth: 0.5,
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingVertical: 14,
  },
  radioText: {
    marginLeft: 12,
  },
});

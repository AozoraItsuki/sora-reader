import { RadioButton } from '@components/RadioButton/RadioButton';
import {
  defaultProxyConfig,
  ProxyConfig,
  ProxyMode,
  useDownloadSettings,
} from '@hooks/persisted/useSettings';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Modal,
  Portal,
  TextInput,
} from 'react-native-paper';

interface ProxySettingsModalProps {
  visible: boolean;
  onDismiss: () => void;
  theme: ThemeColors;
}

const PROXY_MODES: { label: string; value: ProxyMode }[] = [
  {
    label: getString('downloadSettingsScreen.proxyDisabled'),
    value: 'disabled',
  },
  { label: getString('downloadSettingsScreen.proxyHttp'), value: 'http' },
  {
    label: getString('downloadSettingsScreen.proxySocks5'),
    value: 'socks5',
  },
  { label: getString('downloadSettingsScreen.proxyTor'), value: 'tor' },
];

const ProxySettingsModal: React.FC<ProxySettingsModalProps> = ({
  visible,
  onDismiss,
  theme,
}) => {
  const { proxy, setDownloadSettings } = useDownloadSettings();

  const [mode, setMode] = useState<ProxyMode>(proxy.mode);
  const [host, setHost] = useState(proxy.host);
  const [port, setPort] = useState(proxy.port);
  const [username, setUsername] = useState(proxy.username);
  const [password, setPassword] = useState(proxy.password);
  const [torControlHost, setTorControlHost] = useState(proxy.torControlHost);
  const [torControlPort, setTorControlPort] = useState(proxy.torControlPort);
  const [torControlPassword, setTorControlPassword] = useState(
    proxy.torControlPassword,
  );

  useEffect(() => {
    if (visible) {
      const merged: ProxyConfig = { ...defaultProxyConfig, ...proxy };
      setMode(merged.mode);
      setHost(merged.host);
      setPort(merged.port);
      setUsername(merged.username);
      setPassword(merged.password);
      setTorControlHost(merged.torControlHost);
      setTorControlPort(merged.torControlPort);
      setTorControlPassword(merged.torControlPassword);
    }
  }, [visible, proxy]);

  const handleSave = () => {
    const newProxy: ProxyConfig = {
      mode,
      host: host.trim(),
      port: port.trim(),
      username: username.trim(),
      password,
      torControlHost: torControlHost.trim() || '127.0.0.1',
      torControlPort: torControlPort.trim() || '9051',
      torControlPassword,
    };
    setDownloadSettings({ proxy: newProxy });
    onDismiss();
  };

  const inputTheme = {
    colors: {
      onSurfaceVariant: theme.onSurfaceVariant,
      primary: theme.primary,
      onSurface: theme.onSurface,
    },
  };

  const showConnectionFields = mode !== 'disabled';
  const showTorSection = mode === 'tor';

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.container,
          { backgroundColor: theme.surface },
        ]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: theme.onSurface }]}>
            {getString('downloadSettingsScreen.proxySettings')}
          </Text>

          <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>
            {getString('downloadSettingsScreen.proxyMode')}
          </Text>

          {PROXY_MODES.map(item => (
            <RadioButton
              key={item.value}
              status={mode === item.value}
              onPress={() => setMode(item.value)}
              label={item.label}
              theme={theme}
            />
          ))}

          {showTorSection && (
            <Text
              style={[styles.torDesc, { color: theme.onSurfaceVariant }]}
            >
              {getString('downloadSettingsScreen.proxyTorDesc')}
            </Text>
          )}

          {showConnectionFields && (
            <View style={styles.fields}>
              <Text
                style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}
              >
                {mode === 'tor'
                  ? getString('downloadSettingsScreen.proxySocks5')
                  : getString('downloadSettingsScreen.proxy')}
              </Text>

              <TextInput
                mode="outlined"
                label={getString('downloadSettingsScreen.proxyHost')}
                value={host}
                onChangeText={setHost}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.input}
                textColor={theme.onSurface}
                theme={inputTheme}
                placeholder={mode === 'tor' ? '127.0.0.1' : ''}
              />

              <TextInput
                mode="outlined"
                label={getString('downloadSettingsScreen.proxyPort')}
                value={port}
                onChangeText={setPort}
                keyboardType="numeric"
                style={styles.input}
                textColor={theme.onSurface}
                theme={inputTheme}
                placeholder={mode === 'tor' ? '9050' : ''}
              />

              <TextInput
                mode="outlined"
                label={getString('downloadSettingsScreen.proxyUsername')}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                textColor={theme.onSurface}
                theme={inputTheme}
              />

              <TextInput
                mode="outlined"
                label={getString('downloadSettingsScreen.proxyPassword')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                textColor={theme.onSurface}
                theme={inputTheme}
              />
            </View>
          )}

          {showTorSection && (
            <View style={styles.fields}>
              <Text
                style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}
              >
                {getString('downloadSettingsScreen.proxyTorControlSection')}
              </Text>

              <TextInput
                mode="outlined"
                label={getString('downloadSettingsScreen.proxyTorControlHost')}
                value={torControlHost}
                onChangeText={setTorControlHost}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.input}
                textColor={theme.onSurface}
                theme={inputTheme}
                placeholder="127.0.0.1"
              />

              <TextInput
                mode="outlined"
                label={getString('downloadSettingsScreen.proxyTorControlPort')}
                value={torControlPort}
                onChangeText={setTorControlPort}
                keyboardType="numeric"
                style={styles.input}
                textColor={theme.onSurface}
                theme={inputTheme}
                placeholder="9051"
              />

              <TextInput
                mode="outlined"
                label={getString(
                  'downloadSettingsScreen.proxyTorControlPassword',
                )}
                value={torControlPassword}
                onChangeText={setTorControlPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                textColor={theme.onSurface}
                theme={inputTheme}
              />
            </View>
          )}

          <Button
            mode="contained"
            onPress={handleSave}
            style={styles.saveButton}
            buttonColor={theme.primary}
            textColor={theme.onPrimary}
          >
            {getString('downloadSettingsScreen.proxySave')}
          </Button>
        </ScrollView>
      </Modal>
    </Portal>
  );
};

export default ProxySettingsModal;

const styles = StyleSheet.create({
  container: {
    margin: 20,
    borderRadius: 12,
    padding: 20,
    maxHeight: '90%',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  torDesc: {
    fontSize: 13,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 4,
    lineHeight: 18,
  },
  fields: {
    marginTop: 4,
  },
  input: {
    marginBottom: 8,
  },
  saveButton: {
    marginTop: 16,
  },
});

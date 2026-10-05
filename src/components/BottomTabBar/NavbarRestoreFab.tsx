import { useAppSettings, useTheme } from '@hooks/persisted';
import Icon from '@react-native-vector-icons/material-design-icons';
import { getString } from '@strings/translations';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

interface Props {
  position: 'bottom' | 'left' | 'right';
}

const NavbarRestoreFab: React.FC<Props> = ({ position }) => {
  const theme = useTheme();
  const { navbarVisible = true, setAppSettings } = useAppSettings();

  if (navbarVisible) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={getString('appearanceScreen.showNavbar')}
      onPress={() => setAppSettings({ navbarVisible: true })}
      style={[
        styles.fab,
        position === 'left' ? styles.fabLeft : styles.fabRight,
        { backgroundColor: theme.primaryContainer },
      ]}
    >
      <Icon name="menu" size={24} color={theme.onPrimaryContainer} />
    </Pressable>
  );
};

export default NavbarRestoreFab;

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 32,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  fabRight: {
    right: 16,
  },
  fabLeft: {
    left: 16,
  },
});

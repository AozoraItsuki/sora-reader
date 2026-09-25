import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useTheme } from '@hooks/persisted';
import Color from 'color';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface EmptyViewProps {
  icon?: string;
  iconName?: string;
  description: string;
  style?: any;
  children?: React.ReactNode;
  iconStyle?: any;
  theme?: any;
}

const EmptyView = ({
  icon,
  iconName,
  description,
  style,
  children,
  iconStyle,
}: EmptyViewProps) => {
  const theme = useTheme();

  const primary = theme?.primary ?? theme?.outline ?? '#999999';
  const themeColor =
    theme?.onSurfaceVariant ?? theme?.outline ?? theme?.primary ?? '#999999';

  const iconBg = Color(primary).alpha(0.1).string();

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrapper, { backgroundColor: iconBg }]}>
        {icon ? (
          <Text style={[styles.iconText, { color: themeColor }, iconStyle]}>
            {icon}
          </Text>
        ) : iconName ? (
          <MaterialCommunityIcons
            name={iconName as any}
            size={40}
            color={theme.primary}
          />
        ) : (
          <MaterialCommunityIcons
            name="bookshelf"
            size={40}
            color={theme.primary}
          />
        )}
      </View>
      <Text style={[styles.description, { color: themeColor }, style]}>
        {description}
      </Text>
      {children}
    </View>
  );
};

export default EmptyView;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  iconWrapper: {
    alignItems: 'center',
    borderRadius: 32,
    height: 80,
    justifyContent: 'center',
    marginBottom: 16,
    width: 80,
  },
  description: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    textAlign: 'center',
    opacity: 0.75,
  },
  iconText: {
    fontSize: 40,
  },
});

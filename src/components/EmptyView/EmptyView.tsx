import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import Color from 'color';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';

import { ThemeColors } from '../../theme/types';

interface EmptyViewProps {
  icon?: string;
  iconName?: string;
  description: string;
  theme: ThemeColors;
  actions?: Array<{
    iconName: string;
    title: string;
    onPress: () => void;
  }>;
}

const EmptyView: React.FC<EmptyViewProps> = ({
  iconName,
  description,
  theme,
  actions,
}) => {
  const iconBg = Color(theme.primary).alpha(0.1).string();

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrapper, { backgroundColor: iconBg }]}>
        <MaterialCommunityIcons
          name={(iconName as any) || 'bookshelf'}
          size={40}
          color={theme.primary}
        />
      </View>
      <Text style={[styles.text, { color: theme.onSurfaceVariant }]}>
        {description}
      </Text>
      {actions?.length ? (
        <View style={styles.actionsCtn}>
          {actions.map(action => (
            <View key={action.title} style={styles.buttonWrapper}>
              <Button
                rippleColor={theme.rippleColor}
                onPress={action.onPress}
                icon={action.iconName}
                textColor={theme.primary}
                mode="outlined"
              >
                {action.title}
              </Button>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

export default EmptyView;

const styles = StyleSheet.create({
  actionsCtn: {
    flexDirection: 'row',
    marginTop: 24,
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  buttonWrapper: {
    flexDirection: 'row',
  },
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
  text: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    marginTop: 4,
    textAlign: 'center',
    opacity: 0.8,
  },
});

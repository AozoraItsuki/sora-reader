import { useTheme } from '@hooks/persisted';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { MaterialDesignIconName } from '@type/icon';
import { getErrorMessage } from '@utils/error';
import Color from 'color';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface ErrorScreenProps {
  error: any;
  actions?: Array<{
    iconName: MaterialDesignIconName;
    title: string;
    onPress: () => void;
  }>;
}

const ErrorScreen: React.FC<ErrorScreenProps> = ({ error, actions }) => {
  const theme = useTheme();

  const iconBg = Color(theme.error).alpha(0.1).string();
  const errorMessage = getErrorMessage(error);

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrapper, { backgroundColor: iconBg }]}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={40}
          color={theme.error}
        />
      </View>

      <Text style={[styles.title, { color: theme.onSurface }]}>
        Something went wrong
      </Text>

      <View
        style={[
          styles.errorBox,
          {
            backgroundColor: Color(theme.errorContainer).alpha(0.5).string(),
            borderColor: Color(theme.error).alpha(0.15).string(),
          },
        ]}
      >
        <Text
          style={[styles.errorMessage, { color: theme.onErrorContainer || theme.error }]}
          selectable
        >
          {errorMessage}
        </Text>
      </View>

      {actions?.length ? (
        <View style={styles.actionsCtn}>
          {actions.map(action => (
            <Pressable
              key={action.title}
              android_ripple={{ color: theme.rippleColor }}
              onPress={action.onPress}
              style={[
                styles.actionButton,
                {
                  backgroundColor: Color(theme.primary).alpha(0.12).string(),
                  borderColor: Color(theme.primary).alpha(0.2).string(),
                },
              ]}
            >
              <MaterialCommunityIcons
                name={action.iconName}
                size={18}
                color={theme.primary}
              />
              <Text style={[styles.actionText, { color: theme.primary }]}>
                {action.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
};

export default ErrorScreen;

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
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorBox: {
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: 360,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorMessage: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  actionsCtn: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginTop: 24,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

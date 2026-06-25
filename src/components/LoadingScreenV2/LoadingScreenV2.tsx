import Color from 'color';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { ThemeColors } from '../../theme/types';

interface LoadingScreenProps {
  theme: ThemeColors;
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ theme, message }) => {
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createPulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );

    const a1 = createPulse(pulse1, 0);
    const a2 = createPulse(pulse2, 200);
    const a3 = createPulse(pulse3, 400);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [pulse1, pulse2, pulse3]);

  const dotBase = {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.primary,
    marginHorizontal: 5,
  };

  const dotOpacity = (anim: Animated.Value) =>
    anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  const dotScale = (anim: Animated.Value) =>
    anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.2] });

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow}>
        {[pulse1, pulse2, pulse3].map((anim, i) => (
          <Animated.View
            key={i}
            style={[
              dotBase,
              {
                opacity: dotOpacity(anim),
                transform: [{ scale: dotScale(anim) }],
              },
            ]}
          />
        ))}
      </View>
      {message ? (
        <Text
          style={[
            styles.message,
            { color: Color(theme.onSurface).alpha(0.55).string() },
          ]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
};

export default LoadingScreen;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  dotsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  message: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 16,
    textAlign: 'center',
  },
});

import { useAppSettings } from '@hooks/persisted';
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

interface EntranceAnimationOptions {
  duration?: number;
  delay?: number;
  fromY?: number;
  fromOpacity?: number;
}

export function useAnimatedEntrance(options: EntranceAnimationOptions = {}) {
  const { enableAnimations = true } = useAppSettings();
  const {
    duration = 300,
    delay = 0,
    fromY = 16,
    fromOpacity = 0,
  } = options;

  const opacity = useRef(
    new Animated.Value(enableAnimations ? fromOpacity : 1),
  ).current;
  const translateY = useRef(
    new Animated.Value(enableAnimations ? fromY : 0),
  ).current;

  useEffect(() => {
    if (!enableAnimations) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }

    opacity.setValue(fromOpacity);
    translateY.setValue(fromY);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return { opacity, translateY };
}

export function useAnimatedFadeIn(options: { duration?: number; delay?: number } = {}) {
  const { enableAnimations = true } = useAppSettings();
  const { duration = 250, delay = 0 } = options;

  const opacity = useRef(
    new Animated.Value(enableAnimations ? 0 : 1),
  ).current;

  useEffect(() => {
    if (!enableAnimations) {
      opacity.setValue(1);
      return;
    }

    Animated.timing(opacity, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, []);

  return { opacity };
}

export function useAnimatedScale(options: { duration?: number; from?: number } = {}) {
  const { enableAnimations = true } = useAppSettings();
  const { duration = 200, from = 0.95 } = options;

  const scale = useRef(
    new Animated.Value(enableAnimations ? from : 1),
  ).current;
  const opacity = useRef(
    new Animated.Value(enableAnimations ? 0 : 1),
  ).current;

  useEffect(() => {
    if (!enableAnimations) {
      scale.setValue(1);
      opacity.setValue(1);
      return;
    }

    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: duration * 0.7,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return { scale, opacity };
}

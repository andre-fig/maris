import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

export const FADE_OUT_DURATION_MS = 400;

export function useFadeVisibility(visible: boolean) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    opacity.stopAnimation();

    if (visible) {
      setMounted(true);
      opacity.setValue(1);
      return;
    }

    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_OUT_DURATION_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [opacity, visible]);

  return { mounted, opacity };
}

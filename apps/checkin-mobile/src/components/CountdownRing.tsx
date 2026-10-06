import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  size?: number;
  strokeWidth?: number;
  durationMs?: number;
  color: string;
  trackColor: string;
  // Appelé à chaque fois que l'anneau termine un cycle (se vide
  // complètement) — sert à déclencher le rafraîchissement du QR au même
  // rythme que l'anneau, sans coupler les deux animations entre elles.
  onCycleComplete?: () => void;
  children?: React.ReactNode;
};

// Anneau de progression circulaire — se vide en `durationMs` (30s par
// défaut) puis se réinitialise instantanément, en boucle. API `Animated`
// native de React Native (pas Reanimated) : le strokeDashoffset d'un SVG
// n'est de toute façon pas driveable par le native driver, et ça évite une
// dépendance à react-native-worklets qui a fait planter l'app au démarrage
// sur Expo Go (native module manquant) — voir handover.
export function CountdownRing({
  size = 224,
  strokeWidth = 8,
  durationMs = 30000,
  color,
  trackColor,
  onCycleComplete,
  children,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const center = size / 2;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    let cancelled = false;

    const runCycle = () => {
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (cancelled) return;
        if (finished) onCycleComplete?.();
        runCycle();
      });
    };
    runCycle();

    return () => {
      cancelled = true;
      progress.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, circumference],
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface Props { onPress: () => void; compact?: boolean }

const RAINBOW = ['#FF2D9A', '#FF7A00', '#FFF200', '#39FF14', '#00FFF0', '#1685FF', '#BC13FE'];

export function FloatingMicrophoneButton({ onPress, compact = false }: Props) {
  const size = compact ? 38 : 56;
  const ringSize = size + 10;
  const radius = size / 2 + 1.5;
  const circumference = 2 * Math.PI * radius;
  const segment = circumference / RAINBOW.length;
  const [active, setActive] = useState(false);
  const [rotation] = useState(() => new Animated.Value(0));
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    animationRef.current?.stop();
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const handlePressIn = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    rotation.setValue(0);
    animationRef.current?.stop();
    animationRef.current = Animated.loop(Animated.timing(rotation, {
      toValue: 1,
      duration: 1100,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    animationRef.current.start();
    setActive(true);
  };

  const handlePressOut = () => {
    hideTimerRef.current = setTimeout(() => {
      animationRef.current?.stop();
      setActive(false);
    }, 550);
  };

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return <TouchableOpacity
    style={[styles.button, compact ? styles.compactButton : styles.floatingButton]}
    activeOpacity={0.85}
    onPressIn={handlePressIn}
    onPressOut={handlePressOut}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={compact ? 'Nói để thêm lịch' : 'Nói để thêm hoặc sửa lịch họp'}
  >
    {active && <Animated.View pointerEvents="none" style={[styles.rainbowRing, { width: ringSize, height: ringSize, transform: [{ rotate: spin }] }]}>
      <Svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}>
        {RAINBOW.map((color, index) => <Circle
          key={`${color}-glow`}
          cx={ringSize / 2} cy={ringSize / 2} r={radius}
          fill="none" stroke={color} strokeWidth={4} opacity={0.25}
          strokeDasharray={`${segment} ${circumference - segment}`}
          strokeDashoffset={-index * segment}
        />)}
        {RAINBOW.map((color, index) => <Circle
          key={color}
          cx={ringSize / 2} cy={ringSize / 2} r={radius}
          fill="none" stroke={color} strokeWidth={1.8}
          strokeDasharray={`${segment} ${circumference - segment}`}
          strokeDashoffset={-index * segment}
        />)}
      </Svg>
    </Animated.View>}
    <Image source={require('../../assets/microphone-white-blue.png')} style={compact ? styles.compactIcon : styles.icon} resizeMode="contain" />
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#00ADFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingButton: {
    position: 'absolute', right: 20, bottom: 84, zIndex: 2,
    width: 56, height: 56, borderRadius: 28,
    ...Platform.select({
      ios: { shadowColor: '#0079B2', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  compactButton: { marginLeft: 'auto', width: 38, height: 38, borderRadius: 19 },
  rainbowRing: { position: 'absolute', left: -5, top: -5 },
  icon: { width: 62, height: 62 },
  compactIcon: { width: 45, height: 45 },
});

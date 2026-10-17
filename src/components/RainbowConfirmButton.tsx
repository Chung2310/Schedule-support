import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

type Props = {
  disabled: boolean;
  label: string;
  onPress: () => void;
};

const RAINBOW = ['#FF2D9A', '#FF7A00', '#FFF200', '#39FF14', '#00FFF0', '#1685FF', '#BC13FE'];

export function RainbowCircleOutline({ active, size = 64 }: { active: boolean; size?: number }) {
  const [offset, setOffset] = useState(0);
  const strokeWidth = 1.8;
  const radius = size / 2 - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const segment = circumference / RAINBOW.length;

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setOffset(previous => (previous + 8) % circumference), 40);
    return () => clearInterval(timer);
  }, [active, circumference]);

  if (!active) return null;
  return <View pointerEvents="none" style={[styles.circleOutline, { width: size, height: size }]}>
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {RAINBOW.map((color, index) => <Circle key={`${color}-glow`} cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={4} opacity={0.22}
        strokeDasharray={`${segment * 0.78} ${circumference - segment * 0.78}`}
        strokeDashoffset={-index * segment - offset} />)}
      {RAINBOW.map((color, index) => <Circle key={color} cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${segment * 0.78} ${circumference - segment * 0.78}`}
        strokeDashoffset={-index * segment - offset} />)}
    </Svg>
  </View>;
}

export function BrandConfirmButton({ disabled, label, onPress }: Props) {
  return <View style={styles.container}>
    <TouchableOpacity style={[styles.button, disabled && styles.buttonDisabled]} disabled={disabled}
      onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ disabled }}>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  circleOutline: { position: 'absolute', left: 0, top: 0 },
  container: { width: '100%' },
  button: {
    backgroundColor: '#00ADFC',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { backgroundColor: '#CBD5E1' },
  label: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Roboto' },
});

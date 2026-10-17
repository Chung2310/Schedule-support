import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

type Props = {
  disabled: boolean;
  label: string;
  onPress: () => void;
};

const RAINBOW = ['#FF2D9A', '#FF7A00', '#FFF200', '#39FF14', '#00FFF0', '#1685FF', '#BC13FE'];
const RADIUS = 13;

export function RainbowConfirmButton({ disabled, label, onPress }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [pressing, setPressing] = useState(false);
  const [offset, setOffset] = useState(0);
  const rectWidth = size.width + 2;
  const rectHeight = size.height + 2;
  const perimeter = 2 * (rectWidth + rectHeight - 4 * RADIUS) + 2 * Math.PI * RADIUS;
  const segment = perimeter / RAINBOW.length;

  useEffect(() => {
    if (!pressing || disabled || size.width === 0) return;
    const timer = setInterval(() => setOffset(previous => (previous + 28) % perimeter), 40);
    return () => clearInterval(timer);
  }, [pressing, disabled, size.width, perimeter]);

  return (
    <View
      style={styles.container}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
      }}
    >
      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => { setOffset(0); setPressing(true); }}
        onPressOut={() => setPressing(false)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
      >
        <Text style={styles.label}>{label}</Text>
      </TouchableOpacity>
      {pressing && !disabled && size.width > 0 ? (
        <View pointerEvents="none" style={[styles.rainbowOverlay, { width: size.width + 8, height: size.height + 8 }]}>
          <Svg width={size.width + 8} height={size.height + 8} viewBox={`0 0 ${size.width + 8} ${size.height + 8}`}>
            {RAINBOW.map((color, index) => <Rect
              key={`${color}-glow`}
              x={3} y={3} width={rectWidth} height={rectHeight} rx={RADIUS}
              fill="none" stroke={color} strokeWidth={4} opacity={0.25}
              strokeDasharray={`${segment} ${perimeter - segment}`}
              strokeDashoffset={-index * segment - offset}
            />)}
            {RAINBOW.map((color, index) => <Rect
              key={color}
              x={3} y={3} width={rectWidth} height={rectHeight} rx={RADIUS}
              fill="none" stroke={color} strokeWidth={1.8}
              strokeDasharray={`${segment} ${perimeter - segment}`}
              strokeDashoffset={-index * segment - offset}
            />)}
          </Svg>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  rainbowOverlay: { position: 'absolute', left: -4, top: -4 },
});

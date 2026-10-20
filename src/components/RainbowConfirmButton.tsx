import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  disabled: boolean;
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

export function BrandConfirmButton({ disabled, label, onPress, destructive = false }: Props) {
  return <View style={styles.container}>
    <TouchableOpacity style={[styles.button, destructive && styles.buttonDestructive, disabled && styles.buttonDisabled]} disabled={disabled}
      onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ disabled }}>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  </View>;
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
  buttonDestructive: { backgroundColor: '#DC2626' },
  buttonDisabled: { backgroundColor: '#CBD5E1' },
  label: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Roboto' },
});

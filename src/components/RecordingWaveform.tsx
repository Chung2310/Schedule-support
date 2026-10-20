import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

const BAR_COUNT = 29;
const EMPTY_LEVELS = Array(BAR_COUNT).fill(0) as number[];

export type RecordingWaveformHandle = {
  setLevel: (volume: number) => void;
};

type RecordingWaveformProps = {
  active: boolean;
};

export const RecordingWaveform = forwardRef<RecordingWaveformHandle, RecordingWaveformProps>(
  function RecordingWaveform({ active }, ref) {
    const [levels, setLevels] = useState<number[]>(EMPTY_LEVELS);
    const latestVolume = useRef(0);

    useImperativeHandle(ref, () => ({
      setLevel(volume: number) {
        if (!Number.isFinite(volume)) return;
        // Native speech recognition reports -2..10. Values near zero are ambient noise.
        latestVolume.current = Math.max(0, Math.min(1, (volume - 0.5) / 8));
      },
    }), []);

    useEffect(() => {
      if (!active) {
        latestVolume.current = 0;
        return;
      }
      const timer = setInterval(() => {
        const level = latestVolume.current;
        setLevels(previous => [...previous.slice(1), level]);
        // Decay if the recognizer pauses volume events during silence.
        latestVolume.current *= 0.7;
      }, 100);
      return () => {
        clearInterval(timer);
        latestVolume.current = 0;
        setLevels(EMPTY_LEVELS);
      };
    }, [active]);

    return (
      <View style={styles.container} accessible accessibilityLabel={active ? 'Sóng âm thay đổi theo giọng nói đang thu' : 'Sóng âm chờ thu giọng nói'}>
        <View style={styles.wave}>
          {levels.map((level, index) => (
            <View
              key={index}
              style={[
                styles.bar,
                {
                  height: 5 + Math.round(level * 94),
                  opacity: active ? 0.4 + level * 0.6 : 0.35,
                },
              ]}
            />
          ))}
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: 260,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    height: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  bar: {
    width: 5,
    borderRadius: 3,
    backgroundColor: '#00ADFC',
  },
});

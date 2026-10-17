import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';

type ListeningFaceProps = {
  active: boolean;
  size?: number;
};

export const ListeningFace: React.FC<ListeningFaceProps> = ({ active, size = 240 }) => {
  const [eyesClosed, setEyesClosed] = useState(false);
  const [soundFrame, setSoundFrame] = useState(0);

  useEffect(() => {
    if (!active) return;

    let blinkTimer: ReturnType<typeof setTimeout>;
    let reopenTimer: ReturnType<typeof setTimeout>;
    const blink = () => {
      setEyesClosed(true);
      reopenTimer = setTimeout(() => setEyesClosed(false), 140);
      blinkTimer = setTimeout(blink, 2600 + Math.random() * 1600);
    };
    blinkTimer = setTimeout(blink, 1800);
    const soundTimer = setInterval(() => setSoundFrame(frame => (frame + 1) % 6), 240);

    return () => {
      clearTimeout(blinkTimer);
      clearTimeout(reopenTimer);
      clearInterval(soundTimer);
    };
  }, [active]);

  const waveOpacity = (index: number) => active ? ((soundFrame + 3 - index) % 3 === 0 ? 1 : 0.25) : 0.18;
  const height = size * (200 / 240);

  return (
    <View style={[styles.container, { width: size, height }]} accessible accessibilityLabel={active ? 'Nhân vật đang nói với sóng âm phát ra từ miệng' : 'Nhân vật trợ lý giọng nói'}>
      <Svg width={size} height={height} viewBox="-19 0 240 200" fill="none">
        <Defs>
          <LinearGradient id="characterStroke" x1="46" y1="28" x2="183" y2="185">
            <Stop offset="0" stopColor="#76D4FF" />
            <Stop offset="0.55" stopColor="#00ADFC" />
            <Stop offset="1" stopColor="#1777CB" />
          </LinearGradient>
        </Defs>

        <Ellipse cx="101" cy="100" rx="91" ry="91" fill="#ECF9FF" />
        <Path d="M46 186 C50 165 65 157 83 153 L86 141 L119 141 L123 153 C144 157 156 168 160 186" fill="#D6F2FF" stroke="url(#characterStroke)" strokeWidth="3" strokeLinecap="round" />
        <Path d="M85 148 Q103 166 123 148" stroke="#1599E3" strokeWidth="3" strokeLinecap="round" />

        <Path d="M59 88 Q49 81 50 95 Q51 108 61 109" fill="#FFFFFF" stroke="#278DD0" strokeWidth="3" />
        <Path d="M143 88 Q153 81 153 95 Q151 108 141 109" fill="#FFFFFF" stroke="#278DD0" strokeWidth="3" />
        <Path d="M58 75 C58 45 76 30 102 30 C130 30 146 51 146 79 L143 109 C140 134 122 151 103 151 C80 151 63 134 60 109 Z" fill="#FFFFFF" stroke="url(#characterStroke)" strokeWidth="3.5" />

        <Path d="M58 78 C54 52 69 31 94 27 C119 22 142 38 146 65 C133 64 125 57 118 47 C102 65 82 71 58 78 Z" fill="#167FC1" />
        <Path d="M76 53 Q94 56 111 43" stroke="#8DDFFF" strokeWidth="3" strokeLinecap="round" />
        <Path d="M73 82 Q81 77 89 81" stroke="#2376B7" strokeWidth="3" strokeLinecap="round" />
        <Path d="M112 81 Q120 77 128 82" stroke="#2376B7" strokeWidth="3" strokeLinecap="round" />

        {eyesClosed ? (
          <>
            <Path d="M76 96 Q82 101 89 96" stroke="#185F9A" strokeWidth="3" strokeLinecap="round" />
            <Path d="M112 96 Q119 101 125 96" stroke="#185F9A" strokeWidth="3" strokeLinecap="round" />
          </>
        ) : (
          <>
            <Ellipse cx="82" cy="96" rx="3.3" ry="4.3" fill="#185F9A" />
            <Ellipse cx="119" cy="96" rx="3.3" ry="4.3" fill="#185F9A" />
          </>
        )}

        <Path d="M102 96 L99 110 Q98 113 103 114" stroke="#278DD0" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx="72" cy="112" r="5" fill="#DAF3FF" />
        <Circle cx="131" cy="112" r="5" fill="#DAF3FF" />
        {active && soundFrame % 3 !== 0 ? (
          <Ellipse cx="105" cy="126" rx="6" ry="8" fill="#197DBD" />
        ) : (
          <Path d="M97 125 Q105 131 113 124" stroke="#197DBD" strokeWidth="3.5" strokeLinecap="round" />
        )}

        <Path d="M115 125 L143 125" stroke="#00ADFC" strokeWidth="2.5" strokeLinecap="round" opacity={active ? 0.75 : 0.15} />
        <Path d="M149 117 Q158 125 149 133" stroke="#00ADFC" strokeWidth="3.5" strokeLinecap="round" opacity={waveOpacity(0)} />
        <Path d="M161 108 Q177 125 161 142" stroke="#00ADFC" strokeWidth="3.5" strokeLinecap="round" opacity={waveOpacity(1)} />
        <Path d="M174 98 Q198 125 174 152" stroke="#00ADFC" strokeWidth="3.5" strokeLinecap="round" opacity={waveOpacity(2)} />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type Daypart = 'morning' | 'afternoon' | 'evening';

export function DaypartIcon({ period, size = 21 }: { period: Daypart; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {period === 'morning' ? <>
      <Circle cx="12" cy="12" r="4.5" fill="#FFC645" />
      <Path d="M12 1.5V4M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8m11.2 11.2 1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8" stroke="#F5A623" strokeWidth="1.8" strokeLinecap="round" />
    </> : period === 'afternoon' ? <>
      <Circle cx="9" cy="9" r="4.3" fill="#FFCD55" />
      <Path d="M9 1.5v1.4M2.5 9H4M4.1 4.1l1.2 1.2M15.4 4.1l-1.2 1.2" stroke="#F5A623" strokeWidth="1.7" strokeLinecap="round" />
      <Path d="M7.7 19.2h11a3.1 3.1 0 0 0 .3-6.2 5.5 5.5 0 0 0-10.5-1.1 3.7 3.7 0 0 0-.8 7.3Z" fill="#DDF3FF" stroke="#53AFE1" strokeWidth="1.5" strokeLinejoin="round" />
    </> : <>
      <Path d="M16.6 2.9A9.4 9.4 0 1 0 21 17.4 8.1 8.1 0 0 1 16.6 2.9Z" fill="#5D83D1" />
      <Circle cx="18.5" cy="4.4" r="1" fill="#FAD779" />
      <Circle cx="21.2" cy="8.7" r="0.7" fill="#FAD779" />
    </>}
  </Svg>;
}

type ActionIcon = 'bell' | 'check' | 'edit' | 'close' | 'calendar' | 'mic';

export function ScheduleIcon({ name, size = 20, color = '#0A2540' }: { name: ActionIcon; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {name === 'bell' ? <>
      <Path d="M6 17.5h12l-1.8-2.3V10a4.2 4.2 0 0 0-8.4 0v5.2L6 17.5Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <Path d="M10 20a2 2 0 0 0 4 0" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </> : name === 'check' ? <>
      <Circle cx="12" cy="12" r="9" fill="#E8FAF0" />
      <Path d="m7.5 12 3 3 6-6" stroke="#16A45B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </> : name === 'edit' ? <>
      <Path d="M12 5H5.5A1.5 1.5 0 0 0 4 6.5v12A1.5 1.5 0 0 0 5.5 20h12a1.5 1.5 0 0 0 1.5-1.5V12" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <Path d="m10 14 1-.3 8-8-1.7-1.7-8 8L9 14l1 0Z" fill="#DFF4FF" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </> : name === 'close' ? <>
      <Path d="M6 6l12 12M18 6 6 18" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </> : name === 'calendar' ? <>
      <Rect x="3" y="5" width="18" height="16" rx="2.5" stroke={color} strokeWidth="1.7" />
      <Path d="M7 3v4M17 3v4M3 10h18" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <Circle cx="8" cy="14" r="1" fill={color} /><Circle cx="12" cy="14" r="1" fill={color} /><Circle cx="16" cy="14" r="1" fill={color} />
    </> : <>
      <Rect x="9" y="2.5" width="6" height="12" rx="3" fill={color} />
      <Path d="M6 11.5a6 6 0 0 0 12 0M12 17.5v4M8.5 21.5h7" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </>}
  </Svg>;
}

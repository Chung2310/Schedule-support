import { HStack, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  monospacedDigit,
  privacySensitive,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { TodayWidgetProps } from '../utils/todayWidget';

const TodayScheduleLayout = (props: Partial<TodayWidgetProps>, environment: WidgetEnvironment) => {
  'widget';
  const ready = props.ready === true;
  const total = props.total ?? 0;
  const remaining = props.remaining ?? 0;
  const nextTime = props.nextTime ?? '';
  const nextTitle = props.nextTitle ?? '';
  const empty = !ready ? 'Mở iGen Check để đồng bộ lịch' : total ? 'Hôm nay đã hết lịch sắp tới' : 'Hôm nay không có lịch';
  const family = environment.widgetFamily;
  const dark = environment.colorScheme === 'dark';
  const monochrome = environment.widgetRenderingMode !== undefined && environment.widgetRenderingMode !== 'fullColor';
  const primary = { type: 'hierarchical' as const, style: 'primary' as const };
  const secondary = { type: 'hierarchical' as const, style: 'secondary' as const };
  const ink = monochrome ? primary : dark ? '#F1F5F9' : '#0A2540';
  const muted = monochrome ? secondary : dark ? '#CBD5E1' : '#64748B';
  const accent = monochrome ? primary : dark ? '#86EFAC' : '#15803D';

  if (family === 'accessoryInline') {
    return <Text modifiers={[lineLimit(1), privacySensitive()]}>{nextTime ? `${nextTime} ${nextTitle}` : empty}</Text>;
  }
  if (family === 'accessoryRectangular') {
    return <VStack alignment="leading" spacing={2} modifiers={[privacySensitive()]}>
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>LỊCH HÔM NAY</Text>
      <Text modifiers={[font({ size: 14, weight: 'bold' }), lineLimit(1)]}>{nextTime ? `${nextTime} · ${nextTitle}` : empty}</Text>
      {nextTime ? <Text modifiers={[font({ size: 11 }), lineLimit(1)]}>{remaining} lịch sắp tới</Text> : null}
    </VStack>;
  }

  const small = family === 'systemSmall';
  const rowLimit = family === 'systemLarge' ? 6 : 2;
  const allRows = props.rows ?? [];
  const upcomingRows = allRows.filter((row) => !row.past);
  const rows = (family === 'systemLarge' ? allRows : upcomingRows.length ? upcomingRows : allRows.slice(-rowLimit)).slice(0, rowLimit);
  const hidden = Math.max(0, total - rows.length);
  return <VStack alignment="leading" spacing={small ? 6 : 8} modifiers={[
    containerBackground(dark ? '#102235' : '#FFFFFF', 'widget'),
  ]}>
    <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(accent), lineLimit(1)]}>
      {props.dateLabel ? `HÔM NAY · ${props.dateLabel}` : 'HÔM NAY'}
    </Text>
    {small ? <VStack alignment="leading" spacing={4} modifiers={[privacySensitive()]}>
      <Text modifiers={[font({ size: nextTime ? 30 : 15, weight: 'bold' }), foregroundStyle(ink), monospacedDigit(), lineLimit(2)]}>{nextTime || empty}</Text>
      {nextTime ? <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(ink), lineLimit(2)]}>{nextTitle}</Text> : null}
      {total ? <Text modifiers={[font({ size: 11 }), foregroundStyle(muted), lineLimit(1)]}>{remaining} sắp tới · {total} trong ngày</Text> : null}
    </VStack> : <VStack alignment="leading" spacing={8} modifiers={[privacySensitive()]}>
      {rows.length ? rows.map((row) => <HStack key={row.id} alignment="firstTextBaseline" spacing={10}>
        <Text modifiers={[font({ size: 14, weight: 'bold' }), monospacedDigit(), foregroundStyle(row.past ? muted : accent)]}>{row.time}</Text>
        <Text modifiers={[font({ size: 14, weight: 'medium' }), foregroundStyle(row.past ? muted : ink), lineLimit(1)]}>{row.title}</Text>
      </HStack>) : <Text modifiers={[font({ size: 15, weight: 'medium' }), foregroundStyle(ink), lineLimit(2)]}>{empty}</Text>}
      {total ? <Text modifiers={[font({ size: 11 }), foregroundStyle(muted), lineLimit(1)]}>
        {`${remaining} lịch sắp tới${hidden ? ` · ${hidden} lịch khác trong ngày` : ''}`}
      </Text> : null}
    </VStack>}
    <Text modifiers={[font({ size: 10, weight: 'medium' }), foregroundStyle(muted), lineLimit(1)]}>iGen Check</Text>
  </VStack>;
};

export default createWidget('TodayScheduleWidget', TodayScheduleLayout);

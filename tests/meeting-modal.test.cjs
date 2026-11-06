const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-typescript.cjs');

// Exercise the real component's handlers and rerenders with native views as
// boundaries. UIKit presentation and physical safe-area layout need device QA.
function renderComponent(file, name, props, { platform = 'ios', dimensions = {}, mocks = {} } = {}) {
  const slots = [];
  let cursor = 0;
  let dismissals = 0;
  const useState = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const native = Object.fromEntries(['View', 'Text', 'Modal', 'TextInput', 'TouchableOpacity',
    'KeyboardAvoidingView', 'TouchableWithoutFeedback', 'ScrollView'].map(name => [name, name]));
  const component = createLoader({
    react: { useState, useRef: initial => useState(() => ({ current: initial }))[0],
      useMemo: factory => factory(), useCallback: callback => callback, useEffect: () => {} },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { ...native, Platform: { OS: platform }, StyleSheet: { create: styles => styles },
      Keyboard: { dismiss: () => { dismissals++; } },
      useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, ...dimensions }) },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@expo/ui/community/datetime-picker': { DateTimePicker: 'DateTimePicker' },
    ...mocks,
  })(file)[name];
  let tree;
  const render = () => { cursor = 0; tree = component(props); return tree; };
  const nodes = () => {
    const result = [];
    const visit = (value, parents = []) => {
      if (Array.isArray(value)) { value.forEach(child => visit(child, parents)); return; }
      if (!value || typeof value !== 'object' || !value.props) return;
      result.push({ ...value, parents });
      visit(value.props.children, [...parents, value]);
    };
    visit(tree);
    return result;
  };
  render();
  return { render, nodes, dismissals: () => dismissals,
    find: predicate => {
      const node = nodes().find(predicate);
      assert.ok(node, 'Expected control to be rendered');
      return node;
    },
    press: label => {
      const node = nodes().find(node => node.props.accessibilityLabel === label);
      assert.ok(node, `Missing control: ${label}`);
      assert.ok(!node.props.disabled, `Control is disabled: ${label}`);
      node.props.onPress();
      render();
    },
  };
}

const meeting = { id: 'voice-created', title: 'Họp đối tác', meetingTime: new Date(2028, 0, 31, 11).toISOString(),
  advanceNoticeMinutes: 5, repeatIntervalMinutes: 2, status: 'UPCOMING', nagCount: 0 };
const edit = (props = {}, options) => renderComponent('src/components/EditMeetingModal.tsx', 'EditMeetingModal',
  { meeting, onClose: () => {}, onSave: async () => {}, ...props }, options);

test('iOS edits both calendar date and clock time inside the existing modal, then saves the draft', async () => {
  let saved;
  const h = edit({ onSave: async fields => { saved = fields; } });
  h.press('Chọn ngày cuộc họp');
  assert.equal(h.nodes().filter(node => node.type === 'Modal').length, 1);
  let picker = h.find(node => node.type === 'DateTimePicker');
  assert.ok(picker.parents.some(parent => parent.type === 'Modal'));
  assert.equal(picker.props.mode, 'date');
  picker.props.onValueChange({}, new Date(2028, 1, 29));
  h.render();
  h.press('Xong');
  h.press('Chọn giờ cuộc họp');
  picker = h.find(node => node.type === 'DateTimePicker');
  assert.equal(picker.props.value.getDate(), 29);
  assert.equal(picker.props.mode, 'time');
  picker.props.onValueChange({}, new Date(1970, 0, 1, 23, 45));
  h.render();
  h.press('Xong');
  assert.equal(h.nodes().filter(node => node.type === 'DateTimePicker').length, 0);
  await h.find(node => node.type === 'TouchableOpacity' && node.props.children?.props?.children === 'Lưu thay đổi').props.onPress();
  assert.equal(saved.date, '29/02/2028');
  assert.equal(saved.time, '23:45');
  assert.equal(saved.title, meeting.title);
  assert.equal(h.dismissals(), 2);
});

test('closing the iOS picker returns to the draft before closing the edit screen', () => {
  let closed = 0;
  const h = edit({ onClose: () => { closed++; } });
  h.press('Chọn giờ cuộc họp');
  h.find(node => node.type === 'Modal').props.onRequestClose();
  h.render();
  assert.equal(closed, 0);
  assert.equal(h.nodes().filter(node => node.type === 'DateTimePicker').length, 0);
  h.press('Đóng');
  assert.equal(closed, 1);
});

test('Android keeps its native dialog and can dismiss it without closing the edit draft', () => {
  let closed = 0;
  const h = edit({ onClose: () => { closed++; } }, { platform: 'android' });
  h.press('Chọn ngày cuộc họp');
  const picker = h.find(node => node.type === 'DateTimePicker');
  assert.equal(picker.props.presentation, 'dialog');
  picker.props.onDismiss();
  h.render();
  assert.equal(closed, 0);
  assert.equal(h.nodes().filter(node => node.type === 'DateTimePicker').length, 0);
});

test('the voice close control stays inside its own safe area, outside scrolling content, while recording', () => {
  let closed = 0;
  let stopped = 0;
  const h = renderComponent('src/components/VoiceInputModal.tsx', 'VoiceInputModal', {
    visible: true, autoStart: true, initialText: '', selectedDate: new Date(2028, 0, 31),
    settings: {}, meetings: [], onClose: () => { closed++; },
  }, { dimensions: { width: 320, height: 568 }, mocks: {
    'expo-haptics': { impactAsync: () => {}, ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' } },
    '../services/sttService': { STTService: { isNativeAvailable: () => true,
      startListening: async callbacks => { callbacks.onStart(); return true; }, stopListening: () => { stopped++; } } },
    '../hooks/useLocalDay': { useCurrentMinute: () => new Date(2026, 10, 6) },
    './RecordingWaveform': { RecordingWaveform: 'RecordingWaveform' },
    './ListeningFace': { ListeningFace: 'ListeningFace' },
    './RainbowConfirmButton': { BrandConfirmButton: 'BrandConfirmButton' },
  } });
  h.find(node => node.type === 'Modal').props.onShow();
  h.render();
  h.find(node => node.props.accessibilityLabel === 'Dừng nhận diện giọng nói');
  const close = h.find(node => node.props.accessibilityLabel === 'Đóng');
  assert.ok(close.parents.some(parent => parent.type === 'SafeAreaProvider'));
  assert.ok(close.parents.some(parent => parent.type === 'SafeAreaView' && parent.props.edges.includes('top')));
  assert.ok(!close.parents.some(parent => ['ScrollView', 'KeyboardAvoidingView', 'TouchableWithoutFeedback'].includes(parent.type)));
  assert.ok(close.props.style.width >= 44 && close.props.style.height >= 44);
  assert.equal(h.find(node => node.type === 'ScrollView').props.automaticallyAdjustKeyboardInsets, true);
  h.press('Đóng');
  assert.equal(closed, 1);
  assert.equal(stopped, 1);
  assert.equal(h.dismissals(), 1);
});

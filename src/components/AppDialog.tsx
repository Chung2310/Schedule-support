import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type DialogVariant = 'primary' | 'danger';

export type DialogAction = {
  label: string;
  variant?: DialogVariant;
  onPress?: () => void;
};

type DialogState = {
  title: string;
  message: string;
  actions: DialogAction[];
};

type ShowDialog = (title: string, message: string, actions?: DialogAction[]) => void;

const DialogContext = createContext<ShowDialog | null>(null);

export function useAppDialog(): ShowDialog {
  const showDialog = useContext(DialogContext);
  if (!showDialog) throw new Error('useAppDialog must be used inside AppDialogProvider');
  return showDialog;
}

export function useCancelMeetingDialog(onDelete: (id: string) => void) {
  const showDialog = useAppDialog();
  return useCallback((meeting: { id: string; title: string }) => {
    showDialog('Hủy lịch hẹn?', `Bạn có chắc muốn hủy lịch “${meeting.title}” không?`, [
      { label: 'Giữ lại', variant: 'primary' },
      { label: 'Hủy lịch', variant: 'danger', onPress: () => onDelete(meeting.id) },
    ]);
  }, [onDelete, showDialog]);
}

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const showDialog = useCallback<ShowDialog>((title, message, actions = [{ label: 'Đóng' }]) => {
    setDialog({ title, message, actions });
  }, []);
  const contextValue = useMemo(() => showDialog, [showDialog]);
  const dismiss = () => setDialog(null);

  return <DialogContext.Provider value={contextValue}>
    {children}
    <Modal visible={dialog !== null} transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Đóng hộp thoại" />
        {dialog ? <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">{dialog.title}</Text>
          <Text style={styles.message}>{dialog.message}</Text>
          <View style={styles.actions}>
            {dialog.actions.map((action, index) => <TouchableOpacity
              key={`${action.label}-${index}`}
              style={[styles.actionButton, action.variant === 'danger' && styles.dangerButton]}
              accessibilityRole="button"
              onPress={() => {
                dismiss();
                action.onPress?.();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.actionText}>{action.label}</Text>
            </TouchableOpacity>)}
          </View>
        </View> : null}
      </View>
    </Modal>
  </DialogContext.Provider>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10, 25, 47, 0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  card: { width: '100%', maxWidth: 400, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 22, shadowColor: '#0A2540', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 22, elevation: 12 },
  title: { color: '#0A2540', fontFamily: 'Roboto', fontSize: 21, lineHeight: 28 },
  message: { color: '#34495A', fontFamily: 'Roboto', fontSize: 16, lineHeight: 23, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 26 },
  actionButton: { flex: 1, minHeight: 48, paddingHorizontal: 10, borderRadius: 14, backgroundColor: '#00ADFC', alignItems: 'center', justifyContent: 'center' },
  dangerButton: { backgroundColor: '#F44336' },
  actionText: { color: '#FFFFFF', fontFamily: 'Roboto', fontSize: 15, textAlign: 'center' },
});

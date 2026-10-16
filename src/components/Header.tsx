import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenVoiceModal?: () => void;
  backTitle?: string | null;
  onBack?: (() => void) | null;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  backTitle,
  onBack,
}) => {
  return (
    <View style={styles.container}>
      {/* Cột trái: Nút Back đưa lên trên hẳn chuẩn Apple Navigation Bar */}
      <View style={styles.sideColLeft}>
        {onBack && backTitle ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onBack}
            activeOpacity={0.7}
            accessibilityLabel={`Quay lại ${backTitle}`}
          >
            <Ionicons name="chevron-back" size={20} color="#1D4ED8" />
            <Text style={styles.backBtnText} numberOfLines={1}>
              {backTitle}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* The supplied square logo has white padding around its centered wordmark. */}
      <View style={styles.centerBox}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessible
          accessibilityLabel="Igen check"
        />
      </View>

      {/* Cột phải: Nút Cài đặt */}
      <View style={styles.sideColRight}>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={onOpenSettings}
          accessibilityLabel="Cài đặt"
        >
          <Ionicons name="settings-outline" size={20} color="#0A2540" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 10,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideColLeft: {
    width: 105,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 6,
    paddingRight: 6,
  },
  backBtnText: {
    fontSize: 15,
    color: '#1D4ED8',
    fontWeight: '700',
  },
  centerBox: {
    flex: 1,
    height: 36,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    maxWidth: 180,
    aspectRatio: 1,
  },
  sideColRight: {
    width: 105,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
});

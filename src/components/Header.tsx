import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
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
            <Ionicons name="chevron-back" size={20} color="#00ADFC" />
            <Text style={styles.backBtnText} numberOfLines={1}>
              {backTitle}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.centerBox}>
        {onBack ? <Text style={styles.screenTitle}>Lịch theo giờ</Text> : <Image
          source={require('../../assets/logo-brand.png')}
          style={styles.logo}
          resizeMode="contain"
          accessible
          accessibilityLabel="iGen Check"
        />}
      </View>

      <View style={styles.sideColRight}>
        {!onBack ? <TouchableOpacity
          style={styles.settingsBtn}
          onPress={onOpenSettings}
          accessibilityLabel="Cài đặt"
        >
          <Ionicons name="settings-outline" size={20} color="#0A2540" />
        </TouchableOpacity> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
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
    fontSize: 15, fontFamily: 'Roboto',
    color: '#00ADFC',
  },
  centerBox: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: { fontSize: 17, fontFamily: 'Roboto', color: '#0A2540' },
  logo: {
    width: '100%',
    maxWidth: 180,
    height: 50,
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

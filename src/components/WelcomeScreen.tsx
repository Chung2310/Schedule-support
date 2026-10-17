import React, { useState } from 'react';
import {
  ImageBackground,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrivacyPolicyContent } from './PrivacyPolicyContent';
import type { LegalDocumentId } from '../content/legal-documents';

type WelcomeScreenProps = {
  onContinue: () => void | Promise<void>;
};

export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null);
  const insets = useSafeAreaInsets();

  return (
    <ImageBackground
      source={require('../../assets/bg.png')}
      resizeMode="cover"
      style={styles.background}
      accessibilityIgnoresInvertColors
    >
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.continueButton, pressed && styles.continueButtonPressed]}
            onPress={() => { void onContinue(); }}
            accessibilityRole="button"
            accessibilityLabel="Tiếp tục vào iGen Check"
          >
            <Text style={styles.continueText}>Tiếp tục</Text>
          </Pressable>

          <View style={styles.legalLinks}>
            <Pressable
              onPress={() => setLegalDocument('privacy')}
              accessibilityRole="link"
              accessibilityLabel="Chính sách quyền riêng tư"
              hitSlop={8}
            >
              <Text style={styles.legalLink}>Chính sách quyền riêng tư</Text>
            </Pressable>
            <Text style={styles.legalSeparator}>·</Text>
            <Pressable
              onPress={() => setLegalDocument('terms')}
              accessibilityRole="link"
              accessibilityLabel="Điều khoản sử dụng"
              hitSlop={8}
            >
              <Text style={styles.legalLink}>Điều khoản sử dụng</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <Modal
        visible={legalDocument !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setLegalDocument(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {legalDocument ? (
              <PrivacyPolicyContent
                document={legalDocument}
                backLabel="Quay lại"
                onBack={() => setLegalDocument(null)}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  safeArea: {
    flex: 1,
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    marginHorizontal: 24,
    marginBottom: 10,
    alignItems: 'center',
  },
  continueButton: {
    width: '90%',
    maxWidth: 330,
    minHeight: 52,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00ADFC',
    shadowColor: '#007FC0',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  continueButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'Roboto',
  },
  legalLinks: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  legalLink: {
    color: '#17324D',
    fontSize: 12,
    fontFamily: 'Roboto',
  },
  legalSeparator: {
    color: '#64748B',
    fontSize: 13,
    fontFamily: 'Roboto',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8, 24, 39, 0.36)',
  },
  modalSheet: {
    height: '86%',
    paddingTop: 18,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
});

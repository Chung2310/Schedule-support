import React from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import policy from '../content/privacy-policy.json';

const policyUrl = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim();
const supportUrl = process.env.EXPO_PUBLIC_SUPPORT_URL?.trim();

async function openPublicUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Không mở được đường dẫn', 'Bạn hãy thử lại khi có kết nối mạng.');
  }
}

export function PrivacyPolicyContent({ onBack }: { onBack: () => void }) {
  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại cài đặt" onPress={onBack} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color="#0A2540" />
          <Text style={styles.backText}>Cài đặt</Text>
        </TouchableOpacity>
        <Ionicons name="shield-checkmark-outline" size={24} color="#0A2540" />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>{policy.title}</Text>
        <Text style={styles.updated}>{policy.appName} · Cập nhật {policy.updatedAt}</Text>
        <Text style={styles.paragraph}>{policy.intro}</Text>
        {policy.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((paragraph) => <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>)}
          </View>
        ))}
        {policyUrl && /^https:\/\//i.test(policyUrl) ? (
          <TouchableOpacity accessibilityRole="link" onPress={() => void openPublicUrl(policyUrl)} style={styles.linkButton}>
            <Text style={styles.link}>Mở chính sách trên web</Text>
          </TouchableOpacity>
        ) : null}
        {supportUrl && /^(https:\/\/|mailto:)/i.test(supportUrl) ? (
          <TouchableOpacity accessibilityRole="link" onPress={() => void openPublicUrl(supportUrl)} style={styles.linkButton}>
            <Text style={styles.link}>Liên hệ hỗ trợ</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingRight: 12 },
  backText: { fontSize: 16, fontWeight: '600', color: '#0A2540' },
  scroll: { flexShrink: 1 },
  content: { paddingBottom: 20, paddingRight: 16 },
  title: { fontSize: 23, fontWeight: '800', color: '#0A2540', marginBottom: 8 },
  updated: { fontSize: 12, color: '#64748B', marginBottom: 20 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#0A2540', marginBottom: 8 },
  paragraph: { fontSize: 15, lineHeight: 24, color: '#334155', marginBottom: 10 },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 10 },
  link: { fontSize: 15, fontWeight: '600', color: '#0A2540', textDecorationLine: 'underline' },
});

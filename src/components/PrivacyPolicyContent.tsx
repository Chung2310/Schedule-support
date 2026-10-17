import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { legalDocuments, LegalDocumentId } from '../content/legal-documents';
import { useAppDialog } from './AppDialog';

const supportUrl = process.env.EXPO_PUBLIC_SUPPORT_URL?.trim();

async function openPublicUrl(url: string, showDialog: ReturnType<typeof useAppDialog>) {
  try {
    await Linking.openURL(url);
  } catch {
    showDialog('Không mở được đường dẫn', 'Bạn hãy thử lại khi có kết nối mạng.');
  }
}

export function PrivacyPolicyContent({ onBack, document = 'privacy', backLabel = 'Cài đặt' }: {
  onBack: () => void;
  document?: LegalDocumentId;
  backLabel?: string;
}) {
  const showDialog = useAppDialog();
  const { content: policy, url: policyUrl } = legalDocuments[document];
  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Quay lại ${backLabel.toLowerCase()}`} onPress={onBack} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color="#0A2540" />
          <Text style={styles.backText}>{backLabel}</Text>
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
          <TouchableOpacity accessibilityRole="link" onPress={() => void openPublicUrl(policyUrl, showDialog)} style={styles.linkButton}>
            <Text style={styles.link}>Mở trên web</Text>
          </TouchableOpacity>
        ) : null}
        {supportUrl && /^(https:\/\/|mailto:)/i.test(supportUrl) ? (
          <TouchableOpacity accessibilityRole="link" onPress={() => void openPublicUrl(supportUrl, showDialog)} style={styles.linkButton}>
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
  backText: { fontSize: 16, fontFamily: 'Roboto', color: '#0A2540' },
  scroll: { flexShrink: 1 },
  content: { paddingBottom: 20, paddingRight: 16 },
  title: { fontSize: 23, fontFamily: 'Roboto', color: '#0A2540', marginBottom: 8 },
  updated: { fontSize: 12, fontFamily: 'Roboto', color: '#64748B', marginBottom: 20 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 17, fontFamily: 'Roboto', color: '#0A2540', marginBottom: 8 },
  paragraph: { fontSize: 15, fontFamily: 'Roboto', lineHeight: 24, color: '#334155', marginBottom: 10 },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 10 },
  link: { fontSize: 15, fontFamily: 'Roboto', color: '#0A2540', textDecorationLine: 'underline' },
});

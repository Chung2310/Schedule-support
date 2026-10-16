import privacy from './privacy-policy.json';
import terms from './terms-of-service.json';
import deletion from './data-deletion.json';

export const legalDocuments = {
  privacy: { content: privacy, label: 'Privacy Policy', url: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim() },
  terms: { content: terms, label: 'Terms of Service', url: process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL?.trim() },
  deletion: { content: deletion, label: 'Data Deletion', url: process.env.EXPO_PUBLIC_DATA_DELETION_URL?.trim() },
};

export type LegalDocumentId = keyof typeof legalDocuments;

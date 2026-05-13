import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let cached: Firestore | null = null;

export function getDb(): Firestore {
  if (cached) return cached;
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT env var is not set. Add it in Vercel → Settings → Environment Variables with the JSON contents of the service account key.',
      );
    }
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  cached = getFirestore();
  return cached;
}

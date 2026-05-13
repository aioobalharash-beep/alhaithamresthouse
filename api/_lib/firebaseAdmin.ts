import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let cachedDb: Firestore | null = null;
let cachedAuth: Auth | null = null;

function ensureInit(): void {
  if (getApps().length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT env var is not set. Add it in Vercel → Settings → Environment Variables with the JSON contents of the service account key.',
    );
  }
  initializeApp({ credential: cert(JSON.parse(raw)) });
}

export function getDb(): Firestore {
  if (cachedDb) return cachedDb;
  ensureInit();
  cachedDb = getFirestore();
  return cachedDb;
}

export function getAdminAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  ensureInit();
  cachedAuth = getAuth();
  return cachedAuth;
}

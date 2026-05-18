import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { getAdminAuth, getDb } from '../_lib/firebaseAdmin.js';
import { parseIcs, type ParsedEvent } from '../_lib/ical.js';

// Incoming sync — pulls every URL listed in
// settings/property_details.icalImportUrls and writes the union of their
// VEVENTs to settings/external_blocks. The Booking page listens to that doc
// and unions the date ranges into its bookedDates set.
//
//   POST /api/ical/sync
//
// Auth (either is sufficient):
//   1. Authorization: Bearer <SYNC_TOKEN>  — for GitHub Actions / cron jobs.
//      SYNC_TOKEN is a Vercel env var, never exposed to the browser bundle.
//   2. Authorization: Bearer <Firebase ID token>  — for the admin "Sync now"
//      button. We verify the token with firebase-admin and require role=admin
//      on the corresponding users/{uid} doc.

interface ImportUrlEntry {
  url: string;
  label?: string;
}

interface BlockRecord {
  source: string;
  uid: string;
  summary: string;
  start: string;
  end: string;
}

const FETCH_TIMEOUT_MS = 15_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await runSync(req, res);
  } catch (err) {
    // Anything that escapes the inner logic — bad service account, dropped
    // Firestore connection, etc. — lands here as a real JSON message so the
    // GitHub Actions log shows the cause instead of a bare 500.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ical/sync] unhandled error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
}

async function runSync(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let db;
  try {
    db = getDb();
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }

  const authResult = await authorize(req);
  if (!authResult.ok) {
    res.status(authResult.status).json({ error: authResult.message });
    return;
  }

  const settingsSnap = await db.collection('settings').doc('property_details').get();
  const importUrls: ImportUrlEntry[] = settingsSnap.exists
    ? ((settingsSnap.data() as { icalImportUrls?: ImportUrlEntry[] }).icalImportUrls || [])
    : [];

  if (importUrls.length === 0) {
    // Don't wipe already-cached blocks just because the URL list is
    // momentarily empty — that turns an unrelated bug (e.g. an admin save
    // that drops the URLs) into lost availability data. Caller can clear
    // explicitly by removing the external_blocks doc.
    await db.collection('settings').doc('external_blocks').set(
      {
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: 'no_sources',
        errors: [],
      },
      { merge: true },
    );
    res.status(200).json({ ok: true, totalEvents: 0, sources: [], note: 'no import URLs configured' });
    return;
  }

  const blocks: BlockRecord[] = [];
  const errors: { url: string; message: string }[] = [];
  const sources: { url: string; label: string; events: number }[] = [];

  await Promise.all(
    importUrls.map(async (entry) => {
      const label = entry.label?.trim() || hostFor(entry.url);
      try {
        const events = await fetchAndParse(entry.url);
        for (const ev of events) {
          blocks.push({
            source: label,
            uid: ev.uid,
            summary: ev.summary,
            start: ev.start,
            end: ev.end,
          });
        }
        sources.push({ url: entry.url, label, events: events.length });
      } catch (err) {
        errors.push({
          url: entry.url,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  // De-duplicate by (source, uid) so re-syncs don't grow the doc unbounded.
  const seen = new Set<string>();
  const deduped = blocks.filter((b) => {
    const key = `${b.source}::${b.uid}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const status =
    errors.length === 0 ? 'ok' : deduped.length > 0 ? 'partial' : 'failed';

  await db.collection('settings').doc('external_blocks').set(
    {
      blocks: deduped,
      lastSyncedAt: new Date().toISOString(),
      lastSyncStatus: status,
      errors,
    },
    { merge: true },
  );

  res.status(200).json({
    ok: status !== 'failed',
    status,
    totalEvents: deduped.length,
    sources,
    errors,
  });
}

async function fetchAndParse(url: string): Promise<ParsedEvent[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'text/calendar, text/plain;q=0.5, */*;q=0.1' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    return parseIcs(text);
  } finally {
    clearTimeout(timer);
  }
}

function hostFor(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'imported';
  }
}

// ─── Auth helpers ────────────────────────────────────────────────────────────

type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 500; message: string };

async function authorize(req: VercelRequest): Promise<AuthResult> {
  const bearer = extractBearer(req);
  if (!bearer) {
    return { ok: false, status: 401, message: 'Missing bearer token' };
  }

  // Path 1: static SYNC_TOKEN. Used by GitHub Actions / cron jobs.
  const syncToken = process.env.SYNC_TOKEN;
  if (syncToken && timingSafeStringEqual(bearer, syncToken)) {
    return { ok: true };
  }

  // Path 2: Firebase ID token from a signed-in admin (the in-app button).
  try {
    const decoded = await getAdminAuth().verifyIdToken(bearer);
    const allow = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const email = (decoded.email || '').toLowerCase();
    if (allow.length > 0 && allow.includes(email)) {
      return { ok: true };
    }
    // Fall back to the role flag on the users/{uid} profile so admins promoted
    // via Firestore (and not in the env allowlist) still work.
    const profile = await getDb().collection('users').doc(decoded.uid).get();
    if (profile.exists && (profile.data() as { role?: string }).role === 'admin') {
      return { ok: true };
    }
    return { ok: false, status: 403, message: 'Not authorized' };
  } catch {
    return { ok: false, status: 401, message: 'Invalid token' };
  }
}

function extractBearer(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string') {
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  // Allow ?token=… as a fallback for tools that can't set headers.
  const q = req.query.token;
  if (typeof q === 'string' && q) return q;
  if (Array.isArray(q) && q[0]) return q[0];
  return null;
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

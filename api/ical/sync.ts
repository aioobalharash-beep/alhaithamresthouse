import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/firebaseAdmin';
import { parseIcs, type ParsedEvent } from '../_lib/ical';

// Incoming sync — pulls every URL listed in
// settings/property_details.icalImportUrls and writes the union of their
// VEVENTs to settings/external_blocks. The Booking page listens to that doc
// and unions the date ranges into its bookedDates set.
//
//   POST /api/ical/sync
//
// Open by design: only admins can edit settings/property_details (per
// firestore.rules), so the URLs being fetched are already admin-controlled.

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

  const settingsSnap = await db.collection('settings').doc('property_details').get();
  const importUrls: ImportUrlEntry[] = settingsSnap.exists
    ? ((settingsSnap.data() as { icalImportUrls?: ImportUrlEntry[] }).icalImportUrls || [])
    : [];

  if (importUrls.length === 0) {
    await db.collection('settings').doc('external_blocks').set(
      {
        blocks: [],
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: 'ok',
        errors: [],
      },
      { merge: true },
    );
    res.status(200).json({ ok: true, totalEvents: 0, sources: [] });
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

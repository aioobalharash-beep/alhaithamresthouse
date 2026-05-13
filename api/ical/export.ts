import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/firebaseAdmin.js';
import { buildIcs, type ExportEvent } from '../_lib/ical.js';

// Outgoing iCal feed — Booking.com / Massarah / etc. subscribe to this URL.
//
//   GET /api/ical/export?token=<settings.icalExportToken>
//
// The token is the only access control. Treat it like a calendar share key:
// rotate it via the admin UI to invalidate old subscriptions.

const PROD_ID = '-//Al Haitham Rest House//Booking Calendar//EN';
const CALENDAR_NAME = 'Al Haitham Rest House — Bookings';

interface BookingDoc {
  guest_name?: string;
  check_in?: string;
  check_out?: string;
  status?: string;
  slot_name?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const tokenParam = req.query.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  if (!token) {
    res.status(400).json({ error: 'Missing token' });
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
  const expected = (settingsSnap.exists && (settingsSnap.data() as { icalExportToken?: string }).icalExportToken) || '';
  if (!expected || token !== expected) {
    res.status(404).end();
    return;
  }

  const bookingsSnap = await db.collection('bookings').get();
  const events: ExportEvent[] = [];

  bookingsSnap.forEach((doc) => {
    const data = doc.data() as BookingDoc;
    if (!data.check_in || !data.check_out) return;
    if (data.status === 'cancelled') return;

    // Same-day = day-use; iCal needs an exclusive DTEND so push +1 day.
    const isDayUse = data.check_in === data.check_out;
    const end = isDayUse ? advanceDay(data.check_in) : data.check_out;

    const guest = data.guest_name?.trim() || 'Booked';
    const summary = data.slot_name
      ? `Chalet Booking — ${guest} (${data.slot_name})`
      : `Chalet Booking — ${guest}`;

    events.push({
      uid: `${doc.id}@al-haitham-rest-house`,
      summary,
      start: data.check_in,
      end,
    });
  });

  const ics = buildIcs({ calendarName: CALENDAR_NAME, prodId: PROD_ID, events });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="al-haitham-bookings.ics"');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send(ics);
}

function advanceDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

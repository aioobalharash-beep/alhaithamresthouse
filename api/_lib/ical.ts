// ─────────────────────────────────────────────────────────────────────────────
// Tiny RFC 5545 helpers shared by the export and sync endpoints.
//
// We deliberately avoid pulling in `node-ical` / `ical.js` here — they ship
// RRULE, vCard and timezone bundles that we don't need for one-shot
// VEVENT round-trips. Booking.com, Massarah and the like emit a flat list
// of all-day VEVENTs; that's the only shape we need to handle.
// ─────────────────────────────────────────────────────────────────────────────

const CRLF = '\r\n';

/** Fold a single content line to <=75 octets per RFC 5545 §3.1. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + (i === 0 ? 75 : 74));
    out.push(i === 0 ? chunk : ' ' + chunk);
    i += chunk.length - (i === 0 ? 0 : 1);
  }
  return out.join(CRLF);
}

/** Escape commas, semicolons, backslashes and newlines per §3.3.11. */
function escapeText(s: string): string {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function unescapeText(s: string): string {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** "2026-05-12" → "20260512". Tolerates already-compact input. */
function toIcsDate(date: string): string {
  return date.replace(/-/g, '').slice(0, 8);
}

/** Date or datetime → "20260101T120000Z". */
function toIcsTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

export interface ExportEvent {
  uid: string;
  summary: string;
  /** YYYY-MM-DD inclusive */
  start: string;
  /** YYYY-MM-DD exclusive (the morning the chalet is free again) */
  end: string;
  description?: string;
}

/** Build a complete VCALENDAR document from a flat list of events. */
export function buildIcs(opts: {
  calendarName: string;
  prodId: string;
  events: ExportEvent[];
}): string {
  const stamp = toIcsTimestamp(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${opts.prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.calendarName)}`,
  ];
  for (const ev of opts.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(ev.start)}`,
      `DTEND;VALUE=DATE:${toIcsDate(ev.end)}`,
      `SUMMARY:${escapeText(ev.summary)}`,
    );
    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    }
    lines.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

export interface ParsedEvent {
  uid: string;
  summary: string;
  /** YYYY-MM-DD inclusive */
  start: string;
  /** YYYY-MM-DD exclusive */
  end: string;
}

/**
 * Parse a calendar document into VEVENT rows. Handles:
 *   • Line folding (CRLF + space/tab continuation)
 *   • DTSTART/DTEND in either VALUE=DATE or DATETIME form
 *   • TZID parameters (we only keep the date portion — chalets are blocked
 *     for the whole day regardless of timezone)
 * Events without a usable DTSTART are dropped.
 */
export function parseIcs(text: string): ParsedEvent[] {
  // Unfold: CRLF (or LF) followed by space/tab joins to the previous line.
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const events: ParsedEvent[] = [];
  let cur: Partial<ParsedEvent> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur && cur.start) {
        events.push({
          uid: cur.uid || `${cur.start}-${cur.end || cur.start}@imported`,
          summary: cur.summary || 'Imported booking',
          start: cur.start,
          end: cur.end || advanceDay(cur.start),
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = left.split(';')[0].toUpperCase();

    switch (name) {
      case 'UID':
        cur.uid = value;
        break;
      case 'SUMMARY':
        cur.summary = unescapeText(value);
        break;
      case 'DTSTART':
        cur.start = parseDateValue(value);
        break;
      case 'DTEND':
        cur.end = parseDateValue(value);
        break;
    }
  }

  return events;
}

/** "20260512" or "20260512T140000Z" → "2026-05-12". */
function parseDateValue(raw: string): string {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function advanceDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

import React, { useEffect, useState, useTransition } from 'react';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { cn } from '@/src/lib/utils';
import {
  Calendar,
  Copy,
  Check,
  Plus,
  RefreshCw,
  Trash2,
  AlertCircle,
  Link as LinkIcon,
} from 'lucide-react';

// Calendar Sync section embedded in the PropertyEditor.
// Reads/writes:
//   • settings/property_details.icalExportToken (one-shot, generated here)
//   • settings/property_details.icalImportUrls  ({ url, label }[])
//   • settings/external_blocks                  (read-only summary of last sync)

interface ImportUrlEntry {
  url: string;
  label?: string;
}

interface ExternalBlocksDoc {
  blocks?: { source: string; uid: string; summary: string; start: string; end: string }[];
  lastSyncedAt?: string;
  lastSyncStatus?: 'ok' | 'partial' | 'failed' | 'no_sources';
  errors?: { url: string; message: string }[];
}

const inputClass =
  'w-full bg-pearl-white border border-primary-navy/10 rounded-xl py-3 px-4 text-sm font-medium focus:ring-1 focus:ring-secondary-gold/50 outline-none';

function generateToken(): string {
  // Random URL-safe slug, ~22 chars. Sufficient for unguessability since the
  // feed only exposes booking summaries, not auth credentials.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function exportUrlFor(token: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/api/ical/export?token=${encodeURIComponent(token)}`;
}

export const SyncSettings: React.FC = () => {
  const [token, setToken] = useState<string>('');
  const [importUrls, setImportUrls] = useState<ImportUrlEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [savingUrls, setSavingUrls] = useState(false);
  const [copied, setCopied] = useState(false);

  const [draftUrl, setDraftUrl] = useState('');
  const [draftLabel, setDraftLabel] = useState('');

  const [syncing, startSync] = useTransition();
  const [syncResult, setSyncResult] = useState<
    | null
    | {
        ok: boolean;
        totalEvents: number;
        sources: { url: string; label: string; events: number }[];
        errors: { url: string; message: string }[];
      }
  >(null);

  const [externalBlocks, setExternalBlocks] = useState<ExternalBlocksDoc | null>(null);

  // Load sync settings from property_details.
  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, 'settings', 'property_details'))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.exists() ? (snap.data() as { icalExportToken?: string; icalImportUrls?: ImportUrlEntry[] }) : {};
        setToken(data.icalExportToken || '');
        setImportUrls(Array.isArray(data.icalImportUrls) ? data.icalImportUrls : []);
        setLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load sync settings:', err);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live read of the last-sync summary so the UI updates after every sync.
  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'external_blocks'), (snap) => {
      setExternalBlocks(snap.exists() ? (snap.data() as ExternalBlocksDoc) : null);
    });
  }, []);

  const persistToken = async (next: string) => {
    setSavingToken(true);
    try {
      await setDoc(doc(db, 'settings', 'property_details'), { icalExportToken: next }, { merge: true });
      setToken(next);
    } catch (err) {
      console.error('Failed to save export token:', err);
    } finally {
      setSavingToken(false);
    }
  };

  const persistImportUrls = async (next: ImportUrlEntry[]) => {
    setSavingUrls(true);
    try {
      await setDoc(doc(db, 'settings', 'property_details'), { icalImportUrls: next }, { merge: true });
      setImportUrls(next);
    } catch (err) {
      console.error('Failed to save import URLs:', err);
    } finally {
      setSavingUrls(false);
    }
  };

  const handleCopy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(exportUrlFor(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  };

  const handleAddUrl = () => {
    const url = draftUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      alert('URL must start with http:// or https://');
      return;
    }
    persistImportUrls([...importUrls, { url, label: draftLabel.trim() || undefined }]);
    setDraftUrl('');
    setDraftLabel('');
  };

  const handleRemoveUrl = (url: string) => {
    persistImportUrls(importUrls.filter((u) => u.url !== url));
  };

  const handleSync = () => {
    setSyncResult(null);
    startSync(async () => {
      try {
        // The endpoint accepts either a static SYNC_TOKEN (for the GH Actions
        // cron) or a verified Firebase ID token for the admin button. We send
        // the latter so the token never lands in the JS bundle.
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) {
          throw new Error('Not signed in.');
        }
        const r = await fetch('/api/ical/sync', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await r.json();
        if (!r.ok) {
          throw new Error(data.error || `HTTP ${r.status}`);
        }
        setSyncResult(data);
      } catch (err) {
        setSyncResult({
          ok: false,
          totalEvents: 0,
          sources: [],
          errors: [{ url: '', message: err instanceof Error ? err.message : String(err) }],
        });
      }
    });
  };

  if (!loaded) {
    return (
      <section className="bg-white rounded-[20px] p-4 sm:p-6 border border-primary-navy/5 shadow-sm space-y-3">
        <div className="h-5 w-40 bg-primary-navy/5 rounded animate-pulse" />
        <div className="h-12 bg-primary-navy/5 rounded animate-pulse" />
      </section>
    );
  }

  const blocksByDate = (externalBlocks?.blocks || [])
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  const lastSyncLabel = externalBlocks?.lastSyncedAt
    ? new Date(externalBlocks.lastSyncedAt).toLocaleString()
    : 'Never';
  const blockCount = externalBlocks?.blocks?.length ?? 0;
  const exportUrl = token ? exportUrlFor(token) : '';

  return (
    <section className="bg-white rounded-[20px] p-4 sm:p-6 border border-primary-navy/5 shadow-sm space-y-5">
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-secondary-gold" />
        <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">Calendar Sync</h3>
      </div>

      {/* ── Outgoing feed ──────────────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">
          Export link (subscribe URL)
        </label>
        <p className="text-[11px] text-primary-navy/50">
          Paste this into Booking.com or Massarah's calendar import to share your bookings.
        </p>
        {token ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input readOnly value={exportUrl} className={cn(inputClass, 'font-mono text-xs flex-1')} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary-navy text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Generate a new export link? Anyone subscribed to the old link will stop receiving updates.')) {
                    persistToken(generateToken());
                  }
                }}
                disabled={savingToken}
                className="px-3 py-2 rounded-xl border border-primary-navy/10 text-primary-navy/60 text-xs font-bold uppercase tracking-wider hover:bg-primary-navy/5 transition-colors disabled:opacity-40"
                title="Rotate token"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => persistToken(generateToken())}
            disabled={savingToken}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-navy text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
          >
            <LinkIcon size={14} />
            {savingToken ? 'Generating…' : 'Generate export link'}
          </button>
        )}
      </div>

      {/* ── Incoming feeds ─────────────────────────────────────────────── */}
      <div className="space-y-2 pt-2 border-t border-primary-navy/5">
        <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">
          Import links (external calendars)
        </label>
        <p className="text-[11px] text-primary-navy/50">
          We'll fetch each URL on every sync and block any dates they contain.
        </p>

        {importUrls.length > 0 && (
          <ul className="space-y-2">
            {importUrls.map((entry) => (
              <li
                key={entry.url}
                className="flex items-center gap-2 p-3 rounded-xl bg-pearl-white border border-primary-navy/5"
              >
                <div className="flex-1 min-w-0">
                  {entry.label && (
                    <p className="text-xs font-bold text-primary-navy">{entry.label}</p>
                  )}
                  <p className="text-[11px] text-primary-navy/50 font-mono truncate" title={entry.url}>
                    {entry.url}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveUrl(entry.url)}
                  disabled={savingUrls}
                  className="p-2 rounded-lg text-primary-navy/30 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2">
            <input
              type="text"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="Label (e.g. Booking.com)"
              className={inputClass}
            />
            <input
              type="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://ical.booking.com/v1/..."
              className={cn(inputClass, 'font-mono text-xs')}
            />
          </div>
          <button
            type="button"
            onClick={handleAddUrl}
            disabled={savingUrls || !draftUrl.trim()}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary-navy/5 text-primary-navy/70 text-xs font-bold uppercase tracking-wider hover:bg-primary-navy/10 transition-colors disabled:opacity-40"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      {/* ── Sync action + status ───────────────────────────────────────── */}
      <div className="space-y-3 pt-2 border-t border-primary-navy/5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-bold text-primary-navy">
              {blockCount} external block{blockCount === 1 ? '' : 's'} loaded
            </p>
            <p className="text-[11px] text-primary-navy/50">Last synced: {lastSyncLabel}</p>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || importUrls.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary-gold text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>

        {syncResult && (
          <div
            className={cn(
              'rounded-xl p-3 text-xs space-y-1.5',
              syncResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700',
            )}
          >
            <p className="font-bold">
              {syncResult.ok
                ? `Synced ${syncResult.totalEvents} event${syncResult.totalEvents === 1 ? '' : 's'}.`
                : 'Sync failed.'}
            </p>
            {syncResult.sources.map((s) => (
              <p key={s.url} className="text-[11px]">
                • {s.label}: {s.events} event{s.events === 1 ? '' : 's'}
              </p>
            ))}
            {syncResult.errors.map((e, i) => (
              <p key={i} className="text-[11px] flex items-start gap-1.5">
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                <span>
                  {e.url ? `${e.url}: ` : ''}
                  {e.message}
                </span>
              </p>
            ))}
          </div>
        )}

        {externalBlocks?.lastSyncStatus === 'failed' && !syncResult && (
          <div className="rounded-xl p-3 text-xs bg-red-50 text-red-700 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertCircle size={12} />
              Last sync failed
            </p>
            {externalBlocks.errors?.map((e, i) => (
              <p key={i} className="text-[11px]">
                {e.url}: {e.message}
              </p>
            ))}
          </div>
        )}

        {/* Blocks preview — lets the admin verify which dates external feeds
            actually claimed. Caps at 8 rows; remainder is summarised. */}
        {blocksByDate.length > 0 && (
          <details className="rounded-xl border border-primary-navy/5 bg-pearl-white text-xs">
            <summary className="cursor-pointer px-3 py-2 font-bold text-primary-navy/70 select-none">
              View {blocksByDate.length} imported block{blocksByDate.length === 1 ? '' : 's'}
            </summary>
            <ul className="divide-y divide-primary-navy/5">
              {blocksByDate.slice(0, 8).map((b, i) => (
                <li key={`${b.source}-${b.uid}-${i}`} className="px-3 py-2 flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] text-primary-navy/70">
                    {b.start}
                    {b.end && b.end !== b.start ? ` → ${b.end}` : ''}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40 truncate">
                    {b.source}
                  </span>
                </li>
              ))}
              {blocksByDate.length > 8 && (
                <li className="px-3 py-2 text-[11px] text-primary-navy/40 italic">
                  …and {blocksByDate.length - 8} more
                </li>
              )}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
};

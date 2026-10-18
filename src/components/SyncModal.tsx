import React, { useEffect, useState } from 'react';
import { Cloud, Check, RefreshCw, Copy, QrCode, Share2, ShieldAlert, X, Key } from 'lucide-react';
import { extractSyncKey, isSecureSyncKey, isValidSyncKey, normalizeSyncKey, generateSyncKey } from '../utils/sync';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncKey: string;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  syncError: string | null;
  lastSynced: number | null;
  onSetSyncKey: (key: string) => void;
  onRotateSyncKey: (key: string) => Promise<boolean>;
  onDisconnect: () => void;
  onManualSync: () => void;
}

export function SyncModal({
  isOpen,
  onClose,
  syncKey,
  syncStatus,
  syncError,
  lastSynced,
  onSetSyncKey,
  onRotateSyncKey,
  onDisconnect,
  onManualSync,
}: SyncModalProps) {
  const [inputKey, setInputKey] = useState(syncKey || '');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  const handleConnect = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const normalizedKey = normalizeSyncKey(extractSyncKey(inputKey));
    if (!isValidSyncKey(normalizedKey)) {
      setErrorMsg('Key must be a generated encrypted key (pf2-…), or a pairing link from an updated device.');
      return;
    }
    setErrorMsg('');
    setInputKey(normalizedKey);
    onSetSyncKey(normalizedKey);
  };

  const handleGenerate = async () => {
    const newKey = generateSyncKey();
    setErrorMsg('');
    let changed = true;
    changed = await onRotateSyncKey(newKey);
    if (changed) setInputKey(newKey);
  };

  const shareableUrl = typeof window !== 'undefined' && syncKey
    ? `${window.location.origin}${window.location.pathname}#sync=${encodeURIComponent(syncKey)}`
    : '';

  useEffect(() => {
    setShowQr(false);
    setQrDataUrl('');
  }, [shareableUrl]);

  useEffect(() => { setInputKey(syncKey); }, [syncKey]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    if (!shareableUrl) return;
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMsg('Could not copy the link. Select the URL and copy it manually.');
    }
  };

  const handleShareLink = async () => {
    if (!shareableUrl) return;
    if (typeof navigator.share !== 'function') {
      await handleCopyLink();
      return;
    }

    try {
      await navigator.share({
        title: 'Pomoflow task sync',
        text: 'Open this link to pair your Pomoflow tasks.',
        url: shareableUrl,
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setErrorMsg('Could not open the share menu. You can still copy the link.');
      }
    }
  };

  const handleToggleQr = async () => {
    if (showQr) {
      setShowQr(false);
      return;
    }
    if (!shareableUrl) return;
    setQrLoading(true);
    setErrorMsg('');
    try {
      const { toDataURL } = await import('qrcode');
      const dataUrl = await toDataURL(shareableUrl, {
        width: 256,
        margin: 3,
        errorCorrectionLevel: 'M',
        color: { dark: '#171717', light: '#ffffff' },
      });
      setQrDataUrl(dataUrl);
      setShowQr(true);
    } catch {
      setErrorMsg('Could not generate the QR code. Use Share Link or Copy Link instead.');
    } finally {
      setQrLoading(false);
    }
  };

  const statusText = !syncKey
    ? 'Not paired. Tasks stay on this device.'
    : syncStatus === 'synced'
      ? 'Synced'
      : syncStatus === 'error'
        ? 'Sync failed'
        : 'Connecting';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 [background:var(--screen)] font-pixel select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-dialog-title"
    >
      <div className="dialog w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto p-5 sm:p-6">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Cloud className="w-6 h-6" strokeWidth={2.5} />
            <h3 id="sync-dialog-title" className="text-2xl font-bold leading-none">Sync tasks across devices</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close sync modal" className="btn btn-icon">
            <X strokeWidth={3} />
          </button>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between gap-3 border-2 border-[var(--ink)] px-3 py-2 mb-4">
          <div className="min-w-0">
            <div className="text-lg flex items-center gap-2 min-w-0">
              {syncKey && (
                <span
                  aria-hidden="true"
                  className={`inline-block w-3 h-3 border-2 border-[var(--ink)] flex-shrink-0 ${
                    syncStatus === 'synced' ? 'bg-[var(--ink)]' : syncStatus === 'error' ? 'dithered' : 'blink bg-[var(--ink)]'
                  }`}
                />
              )}
              <span className={`font-bold ${syncKey ? 'flex-shrink-0' : ''}`}>{statusText}</span>
              {syncKey && <code className="font-data text-lg truncate">{syncKey}</code>}
            </div>
            {syncError && <p className="mt-1 text-base">{syncError}</p>}
            {lastSynced && syncStatus !== 'error' && (
              <p className="mt-0.5 text-base dim font-data">Last synced {new Date(lastSynced).toLocaleTimeString()}</p>
            )}
          </div>
          {syncKey && (
            <button type="button" onClick={onManualSync} disabled={syncStatus === 'syncing'} className="btn btn-sm flex-shrink-0">
              <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} strokeWidth={2.5} />
              <span>{syncStatus === 'syncing' ? 'Syncing' : 'Sync now'}</span>
            </button>
          )}
        </div>

        {/* Key */}
        <form onSubmit={handleConnect} className="mb-4">
          <label htmlFor="sync-key" className="block text-lg font-bold mb-1">Sync key</label>
          <div className="flex items-center gap-2">
            <input
              id="sync-key"
              type="text"
              value={inputKey}
              onChange={(e) => {
                setInputKey(e.target.value);
                setErrorMsg('');
              }}
              placeholder="Key or pairing link"
              className="field"
            />
            <button type="submit" className="btn">
              {syncKey === inputKey.trim() && syncKey ? 'Update' : 'Connect'}
            </button>
          </div>
          <p className="text-base dim mt-1">Tasks are encrypted on your device. Anyone with this key can read and change them. Keys are not case-sensitive.</p>
          {syncKey && !isSecureSyncKey(syncKey) && (
            <p className="text-base mt-1 flex items-start gap-1.5">
              <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={2.5} />
              <span>Legacy sync is paused. Rotate to an encrypted key. Weak legacy keys can migrate only tasks already on this device.</span>
            </p>
          )}
          {errorMsg && <p className="text-base mt-1 font-bold" role="alert">{errorMsg}</p>}

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button type="button" onClick={handleGenerate} disabled={syncStatus === 'syncing'} className="btn btn-sm">
              <Key className="w-4 h-4" strokeWidth={2.5} />
              <span>{syncKey ? 'Rotate secure key' : 'Generate secure key'}</span>
            </button>
            {syncKey && (
              <button type="button" onClick={onDisconnect} className="btn btn-sm">
                Disconnect
              </button>
            )}
          </div>
          {syncKey && <p className="text-base dim mt-2">Rotating permanently revokes the old link. Pair every other device again with the new link.</p>}
        </form>

        {/* Pairing */}
        {isSecureSyncKey(syncKey) && (
          <div className="groupbox mt-6">
            <div className="groupbox-label">Pair another device</div>
            <input
              type="text"
              name="pairing-link"
              readOnly
              value={shareableUrl}
              aria-label="Pairing link"
              className="field field-sm truncate select-all mb-2"
            />
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={handleShareLink} className="btn btn-sm">
                <Share2 className="w-4 h-4" strokeWidth={2.5} />
                <span>Share</span>
              </button>
              <button type="button" onClick={handleCopyLink} className="btn btn-sm">
                {copied ? <Check className="w-4 h-4" strokeWidth={3} /> : <Copy className="w-4 h-4" strokeWidth={2.5} />}
                <span>{copied ? 'Copied' : 'Copy link'}</span>
              </button>
              <button type="button" onClick={handleToggleQr} disabled={qrLoading} className="btn btn-sm">
                <QrCode className="w-4 h-4" strokeWidth={2.5} />
                <span>{qrLoading ? 'Working' : showQr ? 'Hide QR code' : 'Show QR code'}</span>
              </button>
            </div>
            {showQr && qrDataUrl && (
              <div className="mt-3 flex flex-col items-center">
                <img
                  src={qrDataUrl}
                  alt="QR code containing the Pomoflow pairing link"
                  className="w-56 h-56 max-w-full border-2 border-[var(--ink)] bg-white"
                  style={{ imageRendering: 'pixelated' }}
                />
                <p className="mt-2 text-base dim text-center">Point the other device's camera at this.</p>
              </div>
            )}
            <p className="text-base dim mt-2">Open the link on your other device and confirm which tasks to share.</p>
          </div>
        )}
      </div>
    </div>
  );
}

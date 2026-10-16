import React, { useEffect, useState } from 'react';
import { Cloud, Check, RefreshCw, Copy, QrCode, Share2, ShieldAlert, X, Key } from 'lucide-react';
import { isSecureSyncKey, isValidSyncKey, normalizeSyncKey, generateSyncKey } from '../utils/sync';

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
    const normalizedKey = normalizeSyncKey(inputKey);
    if (!isValidSyncKey(normalizedKey)) {
      setErrorMsg('Key must be 3-32 letters, numbers, or hyphens (e.g. focus-2026)');
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
    if (syncKey) changed = await onRotateSyncKey(newKey);
    else onSetSyncKey(newKey);
    if (changed) setInputKey(newKey);
  };

  const shareableUrl = typeof window !== 'undefined' && syncKey
    ? `${window.location.origin}${window.location.pathname}#sync=${encodeURIComponent(syncKey)}`
    : '';

  useEffect(() => {
    setShowQr(false);
    setQrDataUrl('');
  }, [shareableUrl]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-pixel select-none animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-[#d4d4d4] dark:bg-[#222222] border-2 border-neutral-600 dark:border-neutral-400 p-5 shadow-[6px_6px_0px_rgba(0,0,0,0.4)] dark:shadow-[6px_6px_0px_rgba(255,255,255,0.15)] text-neutral-900 dark:text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-neutral-400 dark:border-neutral-700 mb-4">
          <div className="flex items-center gap-2">
            <Cloud className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            <h3 className="text-2xl font-bold uppercase tracking-wider">Cloudflare Cross-Device Sync</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sync modal"
            className="p-1 hover:bg-neutral-300 dark:hover:bg-neutral-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Status Banner */}
        <div className={`mb-4 p-3 bg-white/70 dark:bg-neutral-900/70 border flex items-center justify-between ${
          syncStatus === 'error' ? 'border-red-500' : 'border-neutral-400 dark:border-neutral-600'
        }`}>
          <div>
            <div className="text-xs uppercase text-neutral-500 dark:text-neutral-400 font-mono-tech">
              Status:
            </div>
            <div className="text-lg font-bold flex items-center gap-2">
              {syncKey ? (
                <>
                  <span className={`w-2.5 h-2.5 rounded-full inline-block ${
                    syncStatus === 'synced'
                      ? 'bg-green-500'
                      : syncStatus === 'error'
                        ? 'bg-red-500'
                        : 'bg-amber-500 animate-pulse'
                  }`} />
                  <span>
                    {syncStatus === 'synced' ? 'Synced' : syncStatus === 'error' ? 'Sync failed' : 'Connecting'}:
                    {' '}<code className="font-mono-tech px-1.5 py-0.5 bg-neutral-200 dark:bg-neutral-800 border border-neutral-400 dark:border-neutral-600">{syncKey}</code>
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 bg-amber-500 rounded-full inline-block" />
                  <span>Local Only (Not Paired)</span>
                </>
              )}
            </div>
            {syncError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400 font-mono-tech">
                {syncError}
              </p>
            )}
            {lastSynced && syncStatus !== 'error' && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 font-mono-tech">
                Last synced {new Date(lastSynced).toLocaleTimeString()}
              </p>
            )}
          </div>

          {syncKey && (
            <button
              type="button"
              onClick={onManualSync}
              disabled={syncStatus === 'syncing'}
              className="px-3 py-1 bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 uppercase text-sm border border-neutral-900 dark:border-neutral-100 cursor-pointer flex items-center gap-1.5 hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              <span>{syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          )}
        </div>

        {/* Key Configuration Form */}
        <form onSubmit={handleConnect} className="space-y-3 mb-4">
          <div>
            <label className="block text-sm uppercase text-neutral-600 dark:text-neutral-400 mb-1">
              Your Sync Passphrase / Key:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputKey}
                onChange={(e) => {
                  setInputKey(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="e.g. my-work-tasks or focus-8492"
                className="flex-1 px-3 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-500 text-neutral-900 dark:text-neutral-100 text-lg font-mono-tech placeholder:text-neutral-400 focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-1.5 bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 uppercase text-lg border border-neutral-900 dark:border-neutral-100 cursor-pointer hover:bg-neutral-700 dark:hover:bg-neutral-300"
              >
                {syncKey === inputKey.trim() && syncKey ? 'Update' : 'Connect'}
              </button>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Keys are not case-sensitive.
            </p>
            {syncKey && !isSecureSyncKey(syncKey) && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                Legacy keys are easier to guess. Generate a new key after all tasks are loaded on this device.
              </p>
            )}
            {errorMsg && <p className="text-red-500 text-sm mt-1">{errorMsg}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              className="px-3 py-1 text-sm uppercase border border-neutral-500 hover:bg-neutral-300 dark:hover:bg-neutral-700 cursor-pointer flex items-center gap-1"
            >
              <Key className="w-3.5 h-3.5" />
                <span>{syncKey ? 'Rotate Secure Key' : 'Generate Secure Key'}</span>
            </button>

            {syncKey && (
              <button
                type="button"
                onClick={onDisconnect}
                className="px-3 py-1 text-sm uppercase text-red-600 dark:text-red-400 border border-red-500/50 hover:bg-red-500/10 cursor-pointer"
              >
                Disconnect
              </button>
            )}
          </div>
        </form>

        {/* Shareable Link */}
        {syncKey && (
          <div className="p-3 bg-neutral-100 dark:bg-neutral-900/60 border border-neutral-400 dark:border-neutral-700 mb-4">
            <div className="text-xs uppercase text-neutral-500 dark:text-neutral-400 font-bold mb-1">
              Pair another device:
            </div>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                readOnly
                value={shareableUrl}
                className="flex-1 px-2 py-1 text-xs font-mono-tech bg-white dark:bg-neutral-800 border border-neutral-400 dark:border-neutral-600 text-neutral-800 dark:text-neutral-200 truncate select-all"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleShareLink}
                  className="flex-1 px-3 py-1.5 bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer hover:bg-neutral-700 dark:hover:bg-neutral-300"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share Link</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex-1 px-3 py-1.5 border border-neutral-500 text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleQr}
                  disabled={qrLoading}
                  className="col-span-2 px-3 py-1.5 border border-neutral-500 text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>{qrLoading ? 'Generating...' : showQr ? 'Hide QR Code' : 'Show QR Code'}</span>
                </button>
              </div>
              {showQr && qrDataUrl && (
                <div className="p-3 bg-white border border-neutral-400 flex flex-col items-center">
                  <img src={qrDataUrl} alt="QR code containing the Pomoflow pairing link" className="w-56 h-56 max-w-full" />
                  <p className="mt-2 text-xs text-neutral-700 font-mono-tech text-center">
                    Scan with the other device's camera.
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 italic">
              Send or open this link on your phone, laptop, or work desktop to pair tasks automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

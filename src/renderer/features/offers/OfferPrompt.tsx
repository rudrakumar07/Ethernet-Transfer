import React, { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { Button } from '../../components/ui';
import type { IncomingOffer } from '../../../shared/types';

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

function OneOffer({ offer }: { offer: IncomingOffer }) {
  const respond = useStore((s) => s.respondToOffer);
  const [trustDevice, setTrustDevice] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.round((offer.expiresAt - Date.now()) / 1000));

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft(Math.max(0, Math.round((offer.expiresAt - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [offer.expiresAt]);

  const dirs = offer.items.filter((i) => i.kind === 'dir');
  const files = offer.items.filter((i) => i.kind === 'file');

  return (
    <div className="w-[380px] rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-4 text-sm">
      <div className="font-semibold mb-1">{offer.deviceName} wants to send you files</div>
      <div className="text-xs text-neutral-500 mb-3">
        {offer.deviceOs} · {offer.linkType} · not trusted yet · ID {offer.shortId}
      </div>
      <div className="border rounded-md p-2 mb-3 text-xs space-y-1 max-h-32 overflow-y-auto">
        {dirs.slice(0, 5).map((d) => <div key={d.index}>{'\u{1F4C1}'} {d.relPath}</div>)}
        {files.slice(0, 5).map((f) => <div key={f.index}>{'\u{1F4C4}'} {f.relPath}</div>)}
        {offer.items.length > 10 && <div className="text-neutral-400">…and more</div>}
        <div className="border-t pt-1 mt-1">Total <b>{formatBytes(offer.totalBytes)}</b> · Save to <b>{offer.destinationDir}</b></div>
      </div>
      <label className="flex items-center gap-2 text-xs mb-3">
        <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
        Always accept from this device (trust it)
      </label>
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400">Auto-declines in {secondsLeft}s</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => respond(offer.offerId, false, false)}>Decline</Button>
          <Button onClick={() => respond(offer.offerId, true, trustDevice)}>Accept</Button>
        </div>
      </div>
    </div>
  );
}

export function OfferPrompt() {
  const offers = useStore((s) => s.offers);
  if (offers.length === 0) return null;
  return (
    <div className="fixed inset-0 flex items-start justify-center pt-20 pointer-events-none z-50">
      <div className="pointer-events-auto">
        <OneOffer offer={offers[0]} />
      </div>
    </div>
  );
}

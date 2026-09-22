import React, { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { Button, Checkbox, DeviceIcon, FileIcon, FolderIcon } from '../../components/ui';
import { formatBytes, LINK_LABEL } from '../../lib/format';
import type { IncomingOffer } from '../../../shared/types';

/** Items listed in the dialog before collapsing the rest into a count. */
const ITEMS_SHOWN = 8;

function OneOffer({ offer }: { offer: IncomingOffer }) {
  const respond = useStore((s) => s.respondToOffer);
  const device = useStore((s) => s.devices.find((d) => d.id === offer.deviceId));
  const [trustDevice, setTrustDevice] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.max(0, Math.round((offer.expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft(Math.max(0, Math.round((offer.expiresAt - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [offer.expiresAt]);

  // Folders first, then files, and an honest count of whatever is left over.
  // The old list showed at most five of each but only said "and more" past
  // ten items, so seven files showed five with no hint two were missing.
  const ordered = [...offer.items.filter((i) => i.kind === 'dir'), ...offer.items.filter((i) => i.kind === 'file')];
  const shown = ordered.slice(0, ITEMS_SHOWN);
  const hidden = ordered.length - shown.length;
  const trusted = device?.trusted ?? false;
  const titleId = `offer-title-${offer.offerId}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="w-[460px] max-w-[calc(100vw-32px)] rounded-card border border-stroke bg-card shadow-dialog overflow-hidden"
    >
      <div className="p-6">
        <div className="flex items-start gap-3 mb-4">
          <span className="w-10 h-10 rounded-control bg-selected text-accent-text flex items-center justify-center shrink-0">
            <DeviceIcon os={offer.deviceOs} size={22} />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-[20px] leading-7 font-semibold text-fg">
              {offer.deviceName} wants to send you files
            </h2>
            <p className="text-[12px] text-fg-2 mt-0.5">
              {LINK_LABEL[offer.linkType]} · {trusted ? 'Trusted' : 'Not trusted'} · ID {offer.shortId}
            </p>
          </div>
        </div>

        <div className="rounded-control border border-stroke bg-layer">
          <ul className="max-h-44 overflow-y-auto divide-y divide-stroke-divider">
            {shown.map((item) => (
              <li key={item.index} className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-fg">
                {item.kind === 'dir' ? (
                  <FolderIcon size={14} className="text-accent-text" />
                ) : (
                  <FileIcon size={14} className="text-fg-2" />
                )}
                <span className="truncate flex-1">{item.relPath}</span>
                {item.kind === 'file' && <span className="text-[12px] text-fg-2 tabular-nums">{formatBytes(item.size)}</span>}
              </li>
            ))}
            {hidden > 0 && (
              <li className="px-3 py-1.5 text-[12px] text-fg-2">…and {hidden.toLocaleString()} more</li>
            )}
          </ul>
          <div className="flex justify-between gap-3 px-3 py-2 border-t border-stroke text-[12px] text-fg-2">
            <span className="shrink-0 whitespace-nowrap">
              {offer.fileCount.toLocaleString()} file(s) · <span className="text-fg font-semibold">{formatBytes(offer.totalBytes)}</span>
            </span>
            <span className="truncate min-w-0" title={offer.destinationDir}>
              Save to <span className="font-mono text-fg">{offer.destinationDir}</span>
            </span>
          </div>
        </div>

        {!trusted && (
          <div className="mt-4">
            <Checkbox checked={trustDevice} onChange={setTrustDevice} label="Always accept from this device" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-6 py-5 bg-layer border-t border-stroke">
        <span className="text-[12px] text-fg-2 tabular-nums">Auto-declines in {secondsLeft}s</span>
        <div className="flex gap-2">
          {/* Decline takes focus: an unexpected offer from an unknown device
              should not be accepted by a stray Enter. */}
          <Button autoFocus onClick={() => void respond(offer.offerId, false, false)} className="min-w-[96px]">
            Decline
          </Button>
          <Button variant="accent" onClick={() => void respond(offer.offerId, true, trustDevice)} className="min-w-[96px]">
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}

export function OfferPrompt() {
  const offers = useStore((s) => s.offers);
  if (offers.length === 0) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <OneOffer key={offers[0].offerId} offer={offers[0]} />
    </div>
  );
}

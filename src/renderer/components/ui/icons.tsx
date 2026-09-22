import React from 'react';

/**
 * Stroke icons drawn inline so they take the surrounding text colour and scale
 * crisply. They replace the unicode glyphs and emoji the UI used before, which
 * rendered differently on every OS.
 */
function Icon({ size = 16, strokeWidth = 1.8, children, className = '' }: {
  size?: number;
  strokeWidth?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type P = { size?: number; className?: string };

export const HomeIcon = (p: P) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></Icon>
);
export const TransfersIcon = (p: P) => (
  <Icon {...p}><path d="M7 20V4M3 8l4-4 4 4M17 4v16M13 16l4 4 4-4" /></Icon>
);
export const DashboardIcon = (p: P) => (
  <Icon {...p}><path d="M4 20V11M10 20V5M16 20v-6M21 20H3" /></Icon>
);
export const SettingsIcon = (p: P) => (
  <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></Icon>
);
export const FileIcon = (p: P) => (
  <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Icon>
);
export const FolderIcon = (p: P) => (
  <Icon {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Icon>
);
export const SearchIcon = (p: P) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Icon>
);
export const PauseIcon = (p: P) => (
  <Icon {...p} strokeWidth={2.4}><path d="M9 5v14M15 5v14" /></Icon>
);
export const PlayIcon = (p: P) => (
  <Icon {...p} strokeWidth={2}><path d="M7 5l12 7-12 7z" /></Icon>
);
export const CloseIcon = (p: P) => (
  <Icon {...p} strokeWidth={2.2}><path d="M6 6l12 12M18 6L6 18" /></Icon>
);
export const RetryIcon = (p: P) => (
  <Icon {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></Icon>
);
export const CheckCircleIcon = (p: P) => (
  <Icon {...p} strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></Icon>
);
export const ErrorIcon = (p: P) => (
  <Icon {...p} strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Icon>
);
export const InfoIcon = (p: P) => (
  <Icon {...p} strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></Icon>
);
export const WarningIcon = (p: P) => (
  <Icon {...p} strokeWidth={2}><path d="M12 3l10 18H2z" /><path d="M12 10v4.5M12 18v.01" /></Icon>
);
export const ShieldIcon = (p: P) => (
  <Icon {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></Icon>
);
export const ChevronIcon = ({ open, ...p }: P & { open?: boolean }) => (
  <Icon {...p} className={`transition-transform ${open ? 'rotate-90' : ''} ${p.className ?? ''}`}><path d="M9 6l6 6-6 6" /></Icon>
);
export const ArrowUpIcon = (p: P) => (
  <Icon {...p} strokeWidth={2.2}><path d="M12 19V5M6 11l6-6 6 6" /></Icon>
);
export const ArrowDownIcon = (p: P) => (
  <Icon {...p} strokeWidth={2.2}><path d="M12 5v14M6 13l6 6 6-6" /></Icon>
);
export const DropIcon = (p: P) => (
  <Icon {...p}><path d="M12 4v12M6 10l6 6 6-6" /><path d="M4 20h16" /></Icon>
);
export const PlugIcon = (p: P) => (
  <Icon {...p}><path d="M9 2v5M15 2v5" /><path d="M6 7h12v4a6 6 0 0 1-12 0z" /><path d="M12 17v5" /></Icon>
);
export const CopyIcon = (p: P) => (
  <Icon {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Icon>
);
export const PaletteIcon = (p: P) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><circle cx="8" cy="10" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16" cy="10" r="1" /><path d="M12 21a3 3 0 0 1 0-6h2a3 3 0 0 0 3-3" /></Icon>
);
export const PowerIcon = (p: P) => (
  <Icon {...p}><path d="M12 3v8" /><path d="M6.3 6.3a8 8 0 1 0 11.4 0" /></Icon>
);
export const TrayIcon = (p: P) => (
  <Icon {...p}><path d="M4 14h4l2 3h4l2-3h4" /><path d="M4 14l2-9h12l2 9v5H4z" /></Icon>
);
export const UserIcon = (p: P) => (
  <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>
);

/** Device glyph by OS; a generic computer when the OS is unknown. */
export function DeviceIcon({ os, ...p }: P & { os: 'windows' | 'macos' | 'linux' | 'unknown' }) {
  if (os === 'macos') {
    return <Icon {...p}><rect x="3" y="4" width="18" height="11" rx="1.5" /><path d="M1 19h22" /></Icon>;
  }
  if (os === 'linux') {
    return <Icon {...p}><rect x="3" y="3" width="18" height="7" rx="1.5" /><rect x="3" y="14" width="18" height="7" rx="1.5" /><path d="M7 6.5h.01M7 17.5h.01" /></Icon>;
  }
  return <Icon {...p}><rect x="3" y="3" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 15v5" /></Icon>;
}

import React from 'react';

export function Button({ children, onClick, variant = 'primary', disabled }: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
}) {
  const base = 'px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50';
  const styles = variant === 'primary'
    ? `${base} bg-blue-600 text-white hover:bg-blue-500`
    : `${base} border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800`;
  return <button className={styles} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">{label}</div>
      {children}
    </div>
  );
}

export function SegmentedToggle<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-neutral-300 dark:border-neutral-600 overflow-hidden text-xs">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`px-2.5 py-1 ${value === opt.value ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-semibold' : 'text-neutral-500'}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ fraction }: { fraction: number }) {
  return (
    <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
      <div className="h-full bg-green-500" style={{ width: `${Math.round(fraction * 100)}%` }} />
    </div>
  );
}

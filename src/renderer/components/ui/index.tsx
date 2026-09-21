import React from 'react';

export function Button({ children, onClick, variant = 'primary', disabled, title }: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
}) {
  const base =
    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
  const styles: Record<string, string> = {
    primary: `${base} bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700`,
    ghost: `${base} border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800`,
    danger: `${base} border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40`,
  };
  return (
    <button className={styles[variant]} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

/** Title row shared by every screen, with an optional slot on the right. */
export function PageHeader({ title, subtitle, actions }: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle && <div className="text-xs text-neutral-500 mt-0.5">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/** Replaces the bare grey sentences that used to stand in for empty screens. */
export function EmptyState({ icon, title, hint, action }: {
  icon: string;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-10 px-4">
      <div className="text-3xl opacity-60" aria-hidden>{icon}</div>
      <div className="text-sm text-neutral-600 dark:text-neutral-300">{title}</div>
      {hint && <div className="text-xs text-neutral-500 max-w-xs leading-relaxed">{hint}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Tile({ label, children, className = '' }: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 min-w-0 ${className}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2">{label}</div>
      {children}
    </div>
  );
}

/** A labelled settings row: label, control, optional explanation. */
export function Field({ label, hint, children }: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">{label}</label>
      {children}
      {hint && <div className="text-[11px] text-neutral-500">{hint}</div>}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const CONTROL =
  'rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`${CONTROL} w-full ${className}`} />;
}

export function Select<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select className={CONTROL} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Native checkbox underneath, so keyboard and screen readers keep working. */
export function Checkbox({ checked, onChange, label, hint }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 accent-blue-600 cursor-pointer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="text-sm">{label}</span>
        {hint && <span className="block text-[11px] text-neutral-500 leading-relaxed">{hint}</span>}
      </span>
    </label>
  );
}

export function SegmentedToggle<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-neutral-300 dark:border-neutral-700 overflow-hidden text-xs">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`px-2.5 py-1 transition-colors ${
            value === opt.value
              ? 'bg-blue-600 text-white font-semibold'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ fraction, indeterminate }: { fraction: number; indeterminate?: boolean }) {
  if (indeterminate) {
    return (
      <div className="h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
        <div className="h-full w-1/3 bg-blue-500 rounded-full animate-pulse" />
      </div>
    );
  }
  return (
    <div className="h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-green-500 transition-[width] duration-200"
        style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
      />
    </div>
  );
}

/** Small status pill used on transfer rows. */
export function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    completed: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
    'completed-with-errors': 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    declined: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    cancelled: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
    interrupted: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    active: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    scanning: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    paused: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  };
  const label = status === 'completed-with-errors' ? 'completed with errors' : status.replace('-', ' ');
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${tone[status] ?? tone.paused}`}>
      {label}
    </span>
  );
}

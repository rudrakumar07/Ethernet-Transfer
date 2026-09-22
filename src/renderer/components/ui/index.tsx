import React from 'react';
import type { LinkType, TransferStatus } from '../../../shared/types';
import { CheckCircleIcon, CloseIcon, ErrorIcon, InfoIcon, WarningIcon } from './icons';

export * from './icons';

/* ---------------------------------------------------------------- buttons */

type ButtonVariant = 'accent' | 'standard' | 'subtle' | 'danger';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 h-8 px-3 rounded-control text-[13px] leading-none ' +
  'transition-colors select-none disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  accent: 'bg-accent text-accent-on hover:bg-accent-hover border border-transparent',
  // Fluent's standard button: a control fill with a slightly darker bottom edge.
  standard:
    'bg-control hover:bg-control-hover text-fg border border-control-stroke border-b-control-stroke-strong',
  subtle: 'bg-transparent hover:bg-subtle-hover active:bg-subtle-pressed text-fg border border-transparent',
  danger: 'bg-control hover:bg-control-hover text-critical border border-control-stroke border-b-control-stroke-strong',
};

export function Button({ children, onClick, variant = 'standard', icon, disabled, title, className = '', autoFocus }: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  disabled?: boolean;
  title?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      autoFocus={autoFocus}
    >
      {icon}
      {children}
    </button>
  );
}

/** Icon-only button. `label` is required: it is the only name a screen reader gets. */
export function IconButton({ label, onClick, children, variant = 'subtle', disabled }: {
  label: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} !px-0 w-8`}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- surfaces */

export function PageHeader({ title, subtitle, actions }: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] leading-9 font-semibold text-fg">{title}</h1>
        {subtitle && <p className="text-[13px] text-fg-2 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '', padded = true, ariaLabel }: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  ariaLabel?: string;
}) {
  return (
    <section
      aria-label={ariaLabel ?? title}
      className={`bg-card border border-stroke rounded-card shadow-card min-w-0 flex flex-col ${
        padded ? 'p-4' : ''
      } ${className}`}
    >
      {(title || actions) && (
        <div className={`flex items-center justify-between gap-3 ${padded ? 'mb-3' : 'px-4 pt-4 pb-3'}`}>
          {title && <h2 className="text-[14px] font-semibold text-fg">{title}</h2>}
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Replaces the bare grey sentences that used to stand in for empty screens. */
export function EmptyState({ icon, title, hint, action }: {
  icon: React.ReactNode;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-8 px-4">
      <div className="text-fg-3" aria-hidden="true">{icon}</div>
      <div className="text-[14px] font-semibold text-fg">{title}</div>
      {hint && <div className="text-[12px] text-fg-2 max-w-sm leading-relaxed">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- feedback */

type Severity = 'info' | 'success' | 'warning' | 'error';

const SEVERITY_STYLE: Record<Severity, { box: string; icon: React.ReactNode }> = {
  info: { box: 'bg-card border-stroke', icon: <InfoIcon size={16} className="text-accent-text" /> },
  success: { box: 'bg-success-bg border-transparent', icon: <CheckCircleIcon size={16} className="text-success" /> },
  warning: { box: 'bg-caution-bg border-transparent', icon: <WarningIcon size={16} className="text-caution" /> },
  error: { box: 'bg-critical-bg border-transparent', icon: <ErrorIcon size={16} className="text-critical" /> },
};

/** Fluent InfoBar: an inline message with an optional dismiss. */
export function InfoBar({ severity, title, children, onClose, action }: {
  severity: Severity;
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  action?: React.ReactNode;
}) {
  const style = SEVERITY_STYLE[severity];
  return (
    <div
      role={severity === 'error' || severity === 'warning' ? 'alert' : 'status'}
      className={`flex items-center gap-3 px-3 min-h-[40px] py-2 rounded-card border text-[13px] text-fg ${style.box}`}
    >
      {style.icon}
      <div className="flex-1 min-w-0">
        {title && <span className="font-semibold mr-1.5">{title}</span>}
        {children}
      </div>
      {action}
      {onClose && (
        <IconButton label="Dismiss" onClick={onClose}>
          <CloseIcon size={12} />
        </IconButton>
      )}
    </div>
  );
}

export function ProgressBar({ fraction, indeterminate, tone = 'accent', label }: {
  fraction: number;
  indeterminate?: boolean;
  tone?: 'accent' | 'success' | 'caution' | 'critical';
  label?: string;
}) {
  const fill = { accent: 'bg-accent', success: 'bg-success', caution: 'bg-caution', critical: 'bg-critical' }[tone];
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : pct}
      className="h-1 rounded-full bg-stroke overflow-hidden"
    >
      {indeterminate ? (
        <div className={`h-full w-1/3 rounded-full ${fill} animate-indeterminate`} />
      ) : (
        <div className={`h-full rounded-full ${fill} transition-[width] duration-300`} style={{ width: `${pct}%` }} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- badges */

const LINK_STYLE: Record<LinkType, { cls: string; label: string }> = {
  direct: { cls: 'bg-link-direct-bg text-link-direct', label: 'Direct cable' },
  wired: { cls: 'bg-link-wired-bg text-link-wired', label: 'Ethernet' },
  wireless: { cls: 'bg-link-wireless-bg text-link-wireless', label: 'Wi-Fi' },
};

export function LinkBadge({ linkType }: { linkType: LinkType }) {
  const s = LINK_STYLE[linkType];
  return (
    <span className={`inline-flex items-center h-5 px-2 rounded-control text-[12px] font-semibold whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function CountBadge({ count, inverted }: { count: number; inverted?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[11px] font-semibold ${
        inverted ? 'bg-accent-on text-accent' : 'bg-accent text-accent-on'
      }`}
    >
      {count}
    </span>
  );
}

const STATUS_STYLE: Partial<Record<TransferStatus, { tone: string; label: string }>> = {
  scanning: { tone: 'text-accent-text', label: 'Scanning' },
  queued: { tone: 'text-fg-2', label: 'Queued' },
  'awaiting-accept': { tone: 'text-fg-2', label: 'Waiting for accept' },
  active: { tone: 'text-accent-text', label: 'Transferring' },
  paused: { tone: 'text-fg-2', label: 'Paused' },
  interrupted: { tone: 'text-caution', label: 'Interrupted' },
  completed: { tone: 'text-success', label: 'Completed' },
  'completed-with-errors': { tone: 'text-caution', label: 'Completed with errors' },
  declined: { tone: 'text-critical', label: 'Declined' },
  failed: { tone: 'text-critical', label: 'Failed' },
  cancelled: { tone: 'text-fg-2', label: 'Cancelled' },
};

export function StatusText({ status }: { status: TransferStatus }) {
  const s = STATUS_STYLE[status] ?? { tone: 'text-fg-2', label: status };
  return <span className={`text-[12px] font-semibold whitespace-nowrap ${s.tone}`}>{s.label}</span>;
}

/* ---------------------------------------------------------------- inputs */

const FIELD =
  'h-8 rounded-control bg-control text-fg text-[13px] px-2.5 border border-control-stroke ' +
  'border-b-control-stroke-strong focus:outline-none focus:border-b-accent focus:border-b-2 ' +
  'placeholder:text-fg-3 disabled:opacity-50';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`${FIELD} w-full ${className}`} />;
}

export function SearchBox({ value, onChange, placeholder, label, className = '' }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD} w-full pr-8`}
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-2 pointer-events-none">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      </span>
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, label }: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <select
      aria-label={label}
      className={`${FIELD} pr-8 min-w-[140px] cursor-pointer`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Fluent ToggleSwitch. A real button with role="switch", so Tab and Space work. */
export function ToggleSwitch({ checked, onChange, label, disabled, showState = true }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  showState?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed group"
    >
      {showState && <span className="text-[13px] text-fg w-7 text-right">{checked ? 'On' : 'Off'}</span>}
      <span
        className={`relative inline-block w-10 h-5 rounded-full border transition-colors ${
          checked
            ? 'bg-accent border-accent group-hover:bg-accent-hover'
            : 'bg-control border-fg-2 group-hover:bg-control-hover'
        }`}
      >
        <span
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all ${
            checked ? 'left-[22px] bg-accent-on' : 'left-[3px] bg-fg-2'
          }`}
        />
      </span>
    </button>
  );
}

export function SegmentedControl<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 rounded-control bg-subtle-hover gap-0.5">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={`h-7 px-3 rounded-[3px] text-[13px] transition-colors ${
              selected ? 'bg-card text-fg font-semibold shadow-card' : 'text-fg-2 hover:text-fg'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Windows 11 settings row: icon, title and description on the left, the
 * control on the right. Optional children render as an expanded body.
 */
export function SettingsCard({ icon, title, description, control, children }: {
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-stroke rounded-card">
      <div className="flex items-center gap-4 px-4 min-h-[64px] py-3">
        <span className="text-fg shrink-0" aria-hidden="true">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] text-fg">{title}</div>
          {description && <div className="text-[12px] text-fg-2 mt-0.5 leading-snug">{description}</div>}
        </div>
        {control && <div className="shrink-0 flex items-center gap-2">{control}</div>}
      </div>
      {children && <div className="border-t border-stroke-divider px-4 py-3">{children}</div>}
    </div>
  );
}

/** Native checkbox underneath, so keyboard and screen-reader behaviour is unchanged. */
export function Checkbox({ checked, onChange, label }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2.5 cursor-pointer text-[13px] text-fg">
      <input
        type="checkbox"
        className="h-4 w-4 rounded-[3px] accent-accent cursor-pointer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

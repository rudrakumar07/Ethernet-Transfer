import { describe, it, expect, vi } from 'vitest';
import { createSessionControl } from '../../src/core/transfer/session/control';

describe('SessionControl', () => {
  it('starts not aborted', () => {
    const control = createSessionControl();
    expect(control.isAborted()).toBe(false);
    expect(control.reason()).toBeNull();
  });

  it('requestPause sets the reason and notifies listeners', () => {
    const control = createSessionControl();
    const cb = vi.fn();
    control.onAbort(cb);
    control.requestPause();
    expect(control.isAborted()).toBe(true);
    expect(control.reason()).toBe('pause');
    expect(cb).toHaveBeenCalledWith('pause');
  });

  it('requestCancel sets the reason and notifies listeners', () => {
    const control = createSessionControl();
    const cb = vi.fn();
    control.onAbort(cb);
    control.requestCancel();
    expect(control.reason()).toBe('cancel');
    expect(cb).toHaveBeenCalledWith('cancel');
  });

  it('the first request wins - a later request is ignored', () => {
    const control = createSessionControl();
    control.requestPause();
    control.requestCancel();
    expect(control.reason()).toBe('pause');
  });

  it('calls a listener registered after abort immediately, with the existing reason', () => {
    const control = createSessionControl();
    control.requestCancel();
    const cb = vi.fn();
    control.onAbort(cb);
    expect(cb).toHaveBeenCalledWith('cancel');
  });

  it('only calls each listener once even if triggered again', () => {
    const control = createSessionControl();
    const cb = vi.fn();
    control.onAbort(cb);
    control.requestPause();
    control.requestPause();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

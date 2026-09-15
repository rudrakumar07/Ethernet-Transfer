type Listener<T> = (payload: T) => void;

/** Small dependency-free typed event emitter used across core module boundaries. */
export class TypedEmitter<EventMap extends { [K in keyof EventMap]: unknown }> {
  private listeners = new Map<keyof EventMap, Set<Listener<unknown>>>();

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return () => this.off(event, listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of Array.from(set)) {
      (listener as Listener<EventMap[K]>)(payload);
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

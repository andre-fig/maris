export const MAX_GFS_TILES_IN_MEMORY = 32;

type Entry<T> = {
  addressKey: string;
  key: string;
  value: T;
  lastAccessed: number;
};

/** Small bounded store for decoded GFS tiles. Persistent storage is separate. */
export class GfsTileMemoryStore<T> {
  private readonly entriesByKey = new Map<string, Entry<T>>();
  private readonly latestKeyByAddress = new Map<string, string>();
  private readonly activeAddresses = new Set<string>();
  private clock = 0;

  setActiveAddresses(addresses: string[]) {
    this.activeAddresses.clear();
    for (const address of addresses) this.activeAddresses.add(address);
    this.evictInactive();
  }

  getLatest(addressKey: string) {
    const key = this.latestKeyByAddress.get(addressKey);
    const entry = key ? this.entriesByKey.get(key) : undefined;
    if (!entry) return undefined;
    entry.lastAccessed = ++this.clock;
    return entry.value;
  }

  upsert(addressKey: string, key: string, value: T) {
    const entry = {
      addressKey,
      key,
      value,
      lastAccessed: ++this.clock,
    };
    this.entriesByKey.set(key, entry);
    this.latestKeyByAddress.set(addressKey, key);
    this.evictInactive();
    return value;
  }

  get size() {
    return this.entriesByKey.size;
  }

  keys() {
    return [...this.entriesByKey.keys()];
  }

  private evictInactive() {
    while (this.entriesByKey.size > MAX_GFS_TILES_IN_MEMORY) {
      const candidate = [...this.entriesByKey.values()]
        .filter((entry) => !this.activeAddresses.has(entry.addressKey))
        .sort((left, right) => left.lastAccessed - right.lastAccessed)[0];
      if (!candidate) return;
      this.entriesByKey.delete(candidate.key);
      if (this.latestKeyByAddress.get(candidate.addressKey) === candidate.key) {
        this.latestKeyByAddress.delete(candidate.addressKey);
      }
    }
  }
}

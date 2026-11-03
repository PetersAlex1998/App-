// In-Memory-Ersatz für AsyncStorage (Tests dürfen den Speicher inspizieren und zurücksetzen).
const mem = new Map<string, string>();
const AsyncStorage = {
  async getItem(k: string) { return mem.has(k) ? mem.get(k)! : null; },
  async setItem(k: string, v: string) { mem.set(k, v); },
  async removeItem(k: string) { mem.delete(k); },
  async clear() { mem.clear(); },
};
export const __mem = mem;
export default AsyncStorage;

/** Limits failed sign-ins per key (email): 5 attempts per 15 minutes. In memory, so it resets on restart. */
export class LoginRateLimiter {
  private entries = new Map<string, { failures: number; resetAt: number }>();

  constructor(
    private maxFailures = 5,
    private windowMs = 15 * 60 * 1000,
    private maxKeys = 2000,
    private now: () => number = Date.now,
  ) {}

  isBlocked(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (entry.resetAt <= this.now()) {
      this.entries.delete(key);
      return false;
    }
    return entry.failures >= this.maxFailures;
  }

  recordFailure(key: string): void {
    const now = this.now();
    const entry = this.entries.get(key);
    if (entry && entry.resetAt > now) {
      entry.failures += 1;
      return;
    }
    if (this.entries.size >= this.maxKeys) this.entries.delete(this.entries.keys().next().value as string);
    this.entries.set(key, { failures: 1, resetAt: now + this.windowMs });
  }

  reset(key: string): void {
    this.entries.delete(key);
  }
}

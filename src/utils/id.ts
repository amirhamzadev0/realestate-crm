export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

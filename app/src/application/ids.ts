let counter = 0;

/** Monotonic id generator so entity/log ids are stable and human-scannable in dev tools. */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString().padStart(3, '0')}`;
}

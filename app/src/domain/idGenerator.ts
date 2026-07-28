/**
 * The single, shared id generator for the entire app. Every layer that needs to mint an id
 * (application services, domain converters/parsers, infrastructure reasoning engines) calls
 * this same function, so ids are globally unique regardless of which module produced them.
 *
 * This file exists because a real bug surfaced from *not* having it: domain/schema's
 * Mermaid parser and application/ids.ts each kept their own independent `let counter = 0`,
 * both minting bare prefixes like "col" — two unrelated tables' columns could legitimately
 * both end up as "col_002", which React then rightly complained about as a duplicate key.
 * One shared counter makes that class of bug structurally impossible.
 */

let counter = 0;

export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString().padStart(3, '0')}`;
}

import { bySymbol, type Element } from './elements';

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const fromSup = (s: string) => Number([...s].map((c) => SUP.indexOf(c)).join(''));

/** Electrons per shell (n = 1, 2, 3…), expanded from the electron configuration. */
export function shells(e: Element): number[] {
  const counts: number[] = [];
  const add = (config: string) => {
    for (const part of config.split(/\s+/)) {
      const core = part.match(/^\[(\w+)\]$/);
      if (core) {
        const noble = bySymbol.get(core[1].toLowerCase());
        if (noble) add(noble.config);
        continue;
      }
      const m = part.match(/^(\d)([spdf])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/);
      if (!m) continue;
      const n = Number(m[1]);
      counts[n - 1] = (counts[n - 1] ?? 0) + fromSup(m[3]);
    }
  };
  add(e.config.replace(/\]\s*/, '] '));
  return Array.from(counts, (c) => c ?? 0);
}

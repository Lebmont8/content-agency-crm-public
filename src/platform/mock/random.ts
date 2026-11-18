export type Rng = () => number;
export function hashSeed(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
export function mulberry32(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export function randInt(rng: Rng, min: number, max: number): number {
    return Math.floor(rng() * (max - min + 1)) + min;
}
export function pick<T>(rng: Rng, arr: readonly T[]): T {
    return arr[Math.floor(rng() * arr.length)];
}
export function chance(rng: Rng, p: number): boolean {
    return rng() < p;
}
export function paretoCents(rng: Rng, minCents: number, maxCents: number, alpha = 1.16): number {
    const u = Math.max(rng(), 1e-9);
    const raw = minCents / Math.pow(u, 1 / alpha);
    return Math.round(Math.min(raw, maxCents));
}

// BASE_URL kadang berakhiran "/" kadang tidak - normalisasi supaya gabungan path selalu benar
// (lihat catatan di astro.config.mjs soal deployment subpath GitHub Pages).
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function assetUrl(path: string): string {
  return `${base}/${path.replace(/^\//, '')}`;
}

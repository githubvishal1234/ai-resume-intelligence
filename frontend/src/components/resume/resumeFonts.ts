import { apiUrl } from "@/services/apiClient";

/** The fonts a resume can use instead of its template's own (backend/app/output/fonts.py). */
export type FontStyle = "sans" | "modern" | "serif" | "condensed";
export type ResumeFont = { id: string; name: string; style: FontStyle };

export const STYLE_LABEL: Record<FontStyle, string> = {
  sans: "Clean sans",
  modern: "Modern",
  serif: "Classic serif",
  condensed: "Condensed (fits more)",
};

const loaded = new Set<string>();

/**
 * The CSS family for a font, loading its two files on first use: the same files the PDF embeds,
 * so the preview shows the downloaded letters. Unknown or empty: null (the template's own font).
 */
export function fontFamily(id: string | null | undefined): string | null {
  if (!id || !/^[A-Za-z0-9]+$/.test(id)) return null;
  const family = `Resume ${id}`;
  if (!loaded.has(id) && typeof document !== "undefined" && typeof FontFace !== "undefined") {
    loaded.add(id);
    for (const [weight, file] of [["400", id], ["700", `${id}-Bold`]] as const) {
      const face = new FontFace(family, `url(${apiUrl(`/output/fonts/${file}.ttf`)})`, { weight });
      document.fonts.add(face);
      void face.load().catch(() => undefined); // offline: the fallback font stays
    }
  }
  return `"${family}"`;
}

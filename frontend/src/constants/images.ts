/**
 * Photos are bundled (not hotlinked) because the CSP only allows same-origin images, and so
 * users' browsers never contact a third party. All are under the Unsplash License; credits are
 * in src/assets/images/CREDITS.md. They are decorative: the text next to them carries the meaning.
 * They appear on the public pages only (product page and sign-in); the app itself has none.
 *
 * Each photo has a 1600px original and an 800px copy (`*-800.webp`, about a fifth of the bytes);
 * `photoSrcSet` lets the browser pick by size.
 */
import insights from "@/assets/images/insights.webp";
import insightsSm from "@/assets/images/insights-800.webp";
import market from "@/assets/images/market.webp";
import marketSm from "@/assets/images/market-800.webp";
import proofs from "@/assets/images/proofs.webp";
import proofsSm from "@/assets/images/proofs-800.webp";
import register from "@/assets/images/register.webp";
import registerSm from "@/assets/images/register-800.webp";
import signin from "@/assets/images/signin.webp";
import signinSm from "@/assets/images/signin-800.webp";

export const PHOTOS = { insights, market, proofs, register, signin } as const;
export type PhotoName = keyof typeof PHOTOS;

const PHOTOS_SMALL: Record<PhotoName, string> = {
  insights: insightsSm,
  market: marketSm,
  proofs: proofsSm,
  register: registerSm,
  signin: signinSm,
};

export function photoSrcSet(name: PhotoName) {
  return `${PHOTOS_SMALL[name]} 800w, ${PHOTOS[name]} 1600w`;
}

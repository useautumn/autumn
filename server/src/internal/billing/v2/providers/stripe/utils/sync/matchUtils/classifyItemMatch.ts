import { productToBasePrice } from "@autumn/shared";
import type { ItemMatch } from "@/internal/billing/v2/actions/sync/detect/types";

type AutumnPriceMatch = Extract<ItemMatch, { kind: "autumn_price" }>;
type AutumnProductMatch = Extract<ItemMatch, { kind: "autumn_product" }>;
type AutumnLicenseMatch = Extract<ItemMatch, { kind: "autumn_license" }>;

/** The item resolved to a specific Autumn price row (`match.price` is known). */
export const isAutumnPriceMatch = (
	match: ItemMatch,
): match is AutumnPriceMatch => match.kind === "autumn_price";

/** The item's Stripe product is a known Autumn plan, but no price on it
 * was recognized — plan known, price unknown. */
export const isAutumnProductMatch = (
	match: ItemMatch,
): match is AutumnProductMatch => match.kind === "autumn_product";

/** The item landed on an Autumn plan at all — a specific price row or the
 * product itself (i.e. not `none` / already climbed to a license). */
export const isAutumnPlanMatch = (
	match: ItemMatch,
): match is AutumnPriceMatch | AutumnProductMatch =>
	isAutumnPriceMatch(match) || isAutumnProductMatch(match);

/** Matched by identity: an Autumn price stores this exact Stripe price id. */
export const matchesOnStripePriceId = (match: ItemMatch): boolean =>
	"matched_on" in match && match.matched_on.type === "stripe_price_id";

/** Matched via the Stripe product id linked to the Autumn plan — plan by
 * identity, price keyed/inferred within it. */
export const matchesOnStripeProductId = (match: ItemMatch): boolean =>
	"matched_on" in match && match.matched_on.type === "stripe_product_id";

/** Matched by shape inference only: the item looks like the plan's base
 * price (amount + interval), no stored Stripe ids involved. */
export const matchesOnBasePriceShape = (match: ItemMatch): boolean =>
	"matched_on" in match && match.matched_on.type === "stripe_base_price_shape";

/** The matched price IS the plan's fixed base price (however it was
 * matched) — false for feature/prepaid price hits. */
export const matchesOnBasePrice = (match: ItemMatch): boolean => {
	if (!isAutumnPriceMatch(match)) return false;
	const basePrice = productToBasePrice({ product: match.product });
	return basePrice !== null && match.price.id === basePrice.id;
};

/* ── Composed classifiers: the role an item plays within its plan ────────── */

/** Hit on the plan's own base price by stored identity or exact shape. */
export const isBasePriceMatch = (match: ItemMatch): match is AutumnPriceMatch =>
	isAutumnPriceMatch(match) && matchesOnBasePrice(match);

/** An unrecognized price on a known plan can become a custom base. */
export const isCustomBaseMatch = (match: ItemMatch): boolean =>
	isAutumnProductMatch(match);

/** Hit on one of the plan's feature prices — any price that isn't its base. */
export const isFeaturePriceMatch = (
	match: ItemMatch,
): match is AutumnPriceMatch =>
	isAutumnPriceMatch(match) && !matchesOnBasePrice(match);

/** Seat item: hit on a license plan offered by a parent plan. */
export const isLicenseSeatMatch = (
	match: ItemMatch,
): match is AutumnLicenseMatch => match.kind === "autumn_license";

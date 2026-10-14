import { productToBasePrice } from "@autumn/shared";
import type { ItemMatch } from "@/internal/billing/v2/actions/sync/detect/types";

type AutumnPriceMatch = Extract<ItemMatch, { kind: "autumn_price" }>;
type AutumnProductMatch = Extract<ItemMatch, { kind: "autumn_product" }>;
type AutumnLicenseMatch = Extract<ItemMatch, { kind: "autumn_license" }>;

export const isAutumnPriceMatch = (
	match: ItemMatch,
): match is AutumnPriceMatch => match.kind === "autumn_price";

export const isAutumnProductMatch = (
	match: ItemMatch,
): match is AutumnProductMatch => match.kind === "autumn_product";

export const isAutumnPlanMatch = (
	match: ItemMatch,
): match is AutumnPriceMatch | AutumnProductMatch =>
	isAutumnPriceMatch(match) || isAutumnProductMatch(match);

export const matchesOnStripePriceId = (match: ItemMatch): boolean =>
	"matched_on" in match && match.matched_on.type === "stripe_price_id";

export const matchesOnStripeProductId = (match: ItemMatch): boolean =>
	"matched_on" in match && match.matched_on.type === "stripe_product_id";

export const matchesOnBasePriceShape = (match: ItemMatch): boolean =>
	"matched_on" in match && match.matched_on.type === "stripe_base_price_shape";

export const matchesOnBasePrice = (match: ItemMatch): boolean => {
	if (!isAutumnPriceMatch(match)) return false;
	const basePrice = productToBasePrice({ product: match.product });
	return basePrice !== null && match.price.id === basePrice.id;
};

const matchesMappedStripeProduct = (match: AutumnPriceMatch): boolean =>
	"stripe_product_id" in match.matched_on &&
	match.product.processor?.id === match.matched_on.stripe_product_id;

const matchesCatalogCurrency = (match: AutumnPriceMatch): boolean => {
	if (match.matched_on.type !== "stripe_base_price_shape") return true;
	const itemCurrency = match.matched_on.currency?.toLowerCase();
	const catalogCurrency = match.price.config.base_currency?.toLowerCase();
	if (!itemCurrency || !catalogCurrency) return true;
	return itemCurrency === catalogCurrency;
};

export const isBasePriceMatch = (match: ItemMatch): match is AutumnPriceMatch =>
	isAutumnPriceMatch(match) &&
	matchesOnBasePrice(match) &&
	(!matchesOnBasePriceShape(match) ||
		(matchesMappedStripeProduct(match) && matchesCatalogCurrency(match)));

export const isCustomBaseMatch = (match: ItemMatch): boolean =>
	isAutumnProductMatch(match) ||
	(isAutumnPriceMatch(match) &&
		matchesOnBasePrice(match) &&
		matchesOnBasePriceShape(match) &&
		!(matchesMappedStripeProduct(match) && matchesCatalogCurrency(match)));

export const isFeaturePriceMatch = (
	match: ItemMatch,
): match is AutumnPriceMatch =>
	isAutumnPriceMatch(match) && !matchesOnBasePrice(match);

export const isLicenseSeatMatch = (
	match: ItemMatch,
): match is AutumnLicenseMatch => match.kind === "autumn_license";

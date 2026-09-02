import { expect } from "bun:test";
import {
	type AppEnv,
	diffPriceStripeObjects,
	type FullCusProduct,
	isFixedPrice,
	isPrepaidPrice,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import { stripePriceIdentityValue } from "@tests/integration/utils/expectStripePriceResources";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";

const priceFeatureId = (price: Price): string | null => {
	if (isFixedPrice(price)) return null;
	const config = price.config as UsagePriceConfig;
	return config.feature_id ?? null;
};

const priceMatchKey = (price: Price): string => {
	if (isFixedPrice(price)) return "__fixed__";
	const featureId = priceFeatureId(price);
	const config = price.config as UsagePriceConfig;
	const billWhen = config.bill_when ?? "<missing>";
	return `feature:${featureId ?? "<missing>"}|bill_when:${billWhen}`;
};

/**
 * Attach a customer's primary FullCusProduct (custom or otherwise) to the
 * matching catalog plan's prices via feature_id (or "fixed" for base prices).
 * Returns matched pairs and the catalog plan for further assertions.
 */
export const loadCustomerAndCatalogPrices = async ({
	ctx,
	customerId,
	catalogProductId,
}: {
	ctx: AutumnContext;
	customerId: string;
	catalogProductId: string;
}): Promise<{
	catalogPrices: Price[];
	customerPrices: Price[];
	pairs: { catalog: Price; customer: Price }[];
	cusProduct: FullCusProduct;
}> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const cusProduct = fullCustomer.customer_products[0];
	if (!cusProduct) {
		throw new Error(`Customer ${customerId} has no customer_products`);
	}

	const fullCatalog = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: catalogProductId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const customerPrices = cusProduct.customer_prices.map(
		(customerPrice) => customerPrice.price,
	);

	const pairs: { catalog: Price; customer: Price }[] = [];
	for (const customerPrice of customerPrices) {
		const key = priceMatchKey(customerPrice);
		const catalogMatch = fullCatalog.prices.find(
			(price) => priceMatchKey(price) === key,
		);
		if (!catalogMatch) continue;
		pairs.push({ catalog: catalogMatch, customer: customerPrice });
	}

	return {
		catalogPrices: fullCatalog.prices,
		customerPrices,
		pairs,
		cusProduct,
	};
};

/**
 * Prepaid prices hold their Stripe Price in the v2 slot, leaving
 * stripe_price_id null — it carries no reuse signal for them.
 */
const reusableStripeObjectDiffs = ({
	catalog,
	customer,
}: {
	catalog: Price;
	customer: Price;
}) => {
	const diffs = diffPriceStripeObjects({ priceA: catalog, priceB: customer });
	if (!isPrepaidPrice(catalog)) return diffs;
	return diffs.filter((diff) => diff.field !== "stripe_price_id");
};

const formatDiffs = ({
	diffs,
}: {
	diffs: { field: string; a: string | null; b: string | null }[];
}): string =>
	diffs
		.map(
			(diff) =>
				`${diff.field}: catalog=${diff.a ?? "null"}, customer=${diff.b ?? "null"}`,
		)
		.join("\n  ");

/**
 * Assert every (catalog, customer) price pair shares all Stripe-object IDs.
 * Each catalog price must also carry a materialized Stripe Price id so the
 * assertion is meaningful (verifies real reuse, not "both empty").
 */
export const expectAllStripeIdsReused = ({
	pairs,
}: {
	pairs: { catalog: Price; customer: Price }[];
}) => {
	expect(pairs.length).toBeGreaterThan(0);
	for (const { catalog, customer } of pairs) {
		expect(
			stripePriceIdentityValue({ price: catalog }),
			`catalog ${priceMatchKey(catalog)} has no Stripe price id — materialize the plan first`,
		).not.toBeNull();
		const diffs = reusableStripeObjectDiffs({ catalog, customer });
		if (diffs.length > 0) {
			throw new Error(
				`Expected stripe-object reuse for ${priceMatchKey(catalog)} but got diffs:\n  ${formatDiffs({ diffs })}`,
			);
		}
	}
};

/**
 * Assert that the customer price keyed by `featureId` (or fixed base when
 * `featureId` is null) does NOT reuse the catalog price's Stripe Price object.
 * Both prices must carry a materialized id for the assertion to be meaningful.
 * Falls back to feature-id-only matching when the strict (feature + bill_when)
 * pairing misses (e.g. prepaid → consumable swap).
 */
export const expectStripePriceIdNotReused = ({
	pairs,
	featureId,
	catalogPrices,
	customerPrices,
}: {
	pairs: { catalog: Price; customer: Price }[];
	featureId: string | null;
	catalogPrices?: Price[];
	customerPrices?: Price[];
}) => {
	let catalogPrice: Price | undefined;
	let customerPrice: Price | undefined;

	if (featureId === null) {
		const pair = pairs.find(({ catalog }) => isFixedPrice(catalog));
		catalogPrice = pair?.catalog;
		customerPrice = pair?.customer;
	} else {
		const pair = pairs.find(
			({ catalog }) => priceFeatureId(catalog) === featureId,
		);
		if (pair) {
			catalogPrice = pair.catalog;
			customerPrice = pair.customer;
		} else if (catalogPrices && customerPrices) {
			catalogPrice = catalogPrices.find(
				(price) => priceFeatureId(price) === featureId,
			);
			customerPrice = customerPrices.find(
				(price) => priceFeatureId(price) === featureId,
			);
		}
	}

	expect(catalogPrice).toBeDefined();
	expect(customerPrice).toBeDefined();
	if (!catalogPrice || !customerPrice) return;
	const catalogId = stripePriceIdentityValue({ price: catalogPrice });
	const customerId = stripePriceIdentityValue({ price: customerPrice });
	expect(catalogId, "catalog price has no Stripe price id").not.toBeNull();
	expect(customerId, "customer price has no Stripe price id").not.toBeNull();
	expect(customerId).not.toBe(catalogId);
};

export { priceMatchKey };

// Re-export for callers
export type { DrizzleCli, AppEnv };

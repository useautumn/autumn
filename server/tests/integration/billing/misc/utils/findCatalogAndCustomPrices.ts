import { expect } from "bun:test";
import {
	type AppEnv,
	diffPriceStripeObjects,
	type FullCusProduct,
	type FullProduct,
	isFixedPrice,
	type Price,
	priceStripeObjectsMatch,
	type UsagePriceConfig,
} from "@autumn/shared";
import { v2BillingStripePriceId } from "@tests/integration/utils/expectStripePriceResources";
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
	catalogProduct: FullProduct;
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
		catalogProduct: fullCatalog,
		catalogPrices: fullCatalog.prices,
		customerPrices,
		pairs,
		cusProduct,
	};
};

const formatDiff = (catalog: Price, customer: Price): string => {
	const diffs = diffPriceStripeObjects({
		priceA: catalog,
		priceB: customer,
	});
	return diffs
		.map(
			(diff) =>
				`${diff.field}: catalog=${diff.a ?? "null"}, customer=${diff.b ?? "null"}`,
		)
		.join("\n  ");
};

/**
 * Assert every (catalog, customer) price pair shares all Stripe-object IDs.
 * Each catalog price must hold its V2 billing price id, so reuse is real, not "both empty".
 */
export const expectAllStripeIdsReused = ({
	pairs,
	catalogProduct,
}: {
	pairs: { catalog: Price; customer: Price }[];
	catalogProduct: FullProduct;
}) => {
	expect(pairs.length).toBeGreaterThan(0);
	for (const { catalog, customer } of pairs) {
		expect(
			v2BillingStripePriceId({ price: catalog, product: catalogProduct }),
		).not.toBeNull();
		const matches = priceStripeObjectsMatch({
			priceA: catalog,
			priceB: customer,
		});
		if (!matches) {
			throw new Error(
				`Expected stripe-object reuse for ${priceMatchKey(catalog)} but got diffs:\n  ${formatDiff(catalog, customer)}`,
			);
		}
	}
};

/**
 * Assert the customer price keyed by `featureId` (null = fixed base) does NOT reuse the
 * catalog's V2 billing price id. Falls back to feature-only matching (e.g. prepaid → consumable).
 */
export const expectStripePriceIdNotReused = ({
	pairs,
	catalogProduct,
	featureId,
	catalogPrices,
	customerPrices,
}: {
	pairs: { catalog: Price; customer: Price }[];
	catalogProduct: FullProduct;
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
	const catalogStripePriceId = v2BillingStripePriceId({
		price: catalogPrice,
		product: catalogProduct,
	});
	const customerStripePriceId = v2BillingStripePriceId({
		price: customerPrice,
		product: catalogProduct,
	});
	expect(catalogStripePriceId).not.toBeNull();
	expect(customerStripePriceId).not.toBeNull();
	expect(customerStripePriceId).not.toBe(catalogStripePriceId);
};

export { priceMatchKey };

// Re-export for callers
export type { DrizzleCli, AppEnv };

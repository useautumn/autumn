import { expect } from "bun:test";
import type { Price, UsagePriceConfig } from "@autumn/shared";
import { loadCustomerAndCatalogPrices } from "@tests/integration/billing/misc/utils/findCatalogAndCustomPrices";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const prepaidStripeIds = ({
	prices,
	featureId,
}: {
	prices: Price[];
	featureId: string;
}) => {
	const prepaid = prices.find(
		(price) => (price.config as UsagePriceConfig).feature_id === featureId,
	);
	const config = prepaid?.config as UsagePriceConfig | undefined;
	return {
		v2: config?.stripe_prepaid_price_v2_id ?? null,
		v1: config?.stripe_price_id ?? null,
	};
};

export const customerPrepaidStripePriceId = async ({
	ctx,
	customerId,
	catalogProductId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	catalogProductId: string;
	featureId: string;
}) => {
	const { customerPrices, catalogPrices } = await loadCustomerAndCatalogPrices({
		ctx,
		customerId,
		catalogProductId,
	});
	return {
		customer: prepaidStripeIds({ prices: customerPrices, featureId }),
		catalog: prepaidStripeIds({ prices: catalogPrices, featureId }),
	};
};

export const expectSharedPrepaidStripePrice = async ({
	ctx,
	customerIds,
	catalogProductId,
	featureId,
	notCatalog = true,
	v1Untouched = true,
}: {
	ctx: AutumnContext;
	customerIds: string[];
	catalogProductId: string;
	featureId: string;
	notCatalog?: boolean;
	v1Untouched?: boolean;
}) => {
	const results = await Promise.all(
		customerIds.map((customerId) =>
			customerPrepaidStripePriceId({
				ctx,
				customerId,
				catalogProductId,
				featureId,
			}),
		),
	);
	const first = results[0]?.customer.v2;
	expect(first).toBeTruthy();
	for (const result of results) {
		expect(result.customer.v2).toBe(first);
		if (notCatalog) {
			expect(result.customer.v2).not.toBe(result.catalog.v2);
		}
		if (v1Untouched) {
			expect(result.customer.v1).not.toBe(first);
		}
	}
	return results;
};

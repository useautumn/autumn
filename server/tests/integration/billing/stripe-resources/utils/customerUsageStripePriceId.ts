import { expect } from "bun:test";
import type { Price, UsagePriceConfig } from "@autumn/shared";
import { loadCustomerAndCatalogPrices } from "@tests/integration/billing/misc/utils/findCatalogAndCustomPrices";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const usageStripePriceId = ({
	prices,
	featureId,
}: {
	prices: Price[];
	featureId: string;
}) => {
	const usage = prices.find(
		(price) => (price.config as UsagePriceConfig).feature_id === featureId,
	);
	return (usage?.config as UsagePriceConfig | undefined)?.stripe_price_id ?? null;
};

export const customerUsageStripePriceId = async ({
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
		customerStripePriceId: usageStripePriceId({
			prices: customerPrices,
			featureId,
		}),
		catalogStripePriceId: usageStripePriceId({
			prices: catalogPrices,
			featureId,
		}),
	};
};

export const expectSharedUsageStripePrice = async ({
	ctx,
	customerIds,
	catalogProductId,
	featureId,
	notCatalog = true,
}: {
	ctx: AutumnContext;
	customerIds: string[];
	catalogProductId: string;
	featureId: string;
	notCatalog?: boolean;
}) => {
	const results = await Promise.all(
		customerIds.map((customerId) =>
			customerUsageStripePriceId({
				ctx,
				customerId,
				catalogProductId,
				featureId,
			}),
		),
	);
	const first = results[0]?.customerStripePriceId;
	expect(first).toBeTruthy();
	for (const result of results) {
		expect(result.customerStripePriceId).toBe(first);
		if (notCatalog) {
			expect(result.customerStripePriceId).not.toBe(result.catalogStripePriceId);
		}
	}
	return results;
};

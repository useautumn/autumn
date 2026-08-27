import { expect } from "bun:test";
import type { Price, UsagePriceConfig } from "@autumn/shared";
import { loadCustomerAndCatalogPrices } from "@tests/integration/billing/misc/utils/findCatalogAndCustomPrices";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const usagePriceConfig = ({
	prices,
	featureId,
}: {
	prices: Price[];
	featureId: string;
}): UsagePriceConfig | undefined => {
	const usage = prices.find(
		(price) => (price.config as UsagePriceConfig).feature_id === featureId,
	);
	return usage?.config as UsagePriceConfig | undefined;
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
	const customerConfig = usagePriceConfig({
		prices: customerPrices,
		featureId,
	});
	const catalogConfig = usagePriceConfig({
		prices: catalogPrices,
		featureId,
	});
	return {
		customerStripePriceId: customerConfig?.stripe_price_id ?? null,
		catalogStripePriceId: catalogConfig?.stripe_price_id ?? null,
		customerStripeProductId: customerConfig?.stripe_product_id ?? null,
		customerStripeMeterId: customerConfig?.stripe_meter_id ?? null,
		customerStripeEventName: customerConfig?.stripe_event_name ?? null,
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

export const expectSharedUsageStripeMeter = async ({
	ctx,
	customerIds,
	catalogProductId,
	featureId,
}: {
	ctx: AutumnContext;
	customerIds: string[];
	catalogProductId: string;
	featureId: string;
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
	const firstMeter = results[0]?.customerStripeMeterId;
	const firstEventName = results[0]?.customerStripeEventName;
	expect(firstMeter).toBeTruthy();
	expect(firstEventName).toBeTruthy();
	for (const result of results) {
		expect(result.customerStripeMeterId).toBe(firstMeter);
		expect(result.customerStripeEventName).toBe(firstEventName);
	}
	return results;
};

export const expectSharedUsageStripeProduct = async ({
	ctx,
	customerIds,
	catalogProductId,
	featureId,
}: {
	ctx: AutumnContext;
	customerIds: string[];
	catalogProductId: string;
	featureId: string;
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
	const first = results[0]?.customerStripeProductId;
	expect(first).toBeTruthy();
	for (const result of results) {
		expect(result.customerStripeProductId).toBe(first);
	}
	return results;
};

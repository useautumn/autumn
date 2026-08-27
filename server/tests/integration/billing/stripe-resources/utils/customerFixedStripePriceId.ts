import { expect } from "bun:test";
import { type FixedPriceConfig, isFixedPrice, type Price } from "@autumn/shared";
import { loadCustomerAndCatalogPrices } from "@tests/integration/billing/misc/utils/findCatalogAndCustomPrices";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const fixedStripePriceId = ({ prices }: { prices: Price[] }) => {
	const fixed = prices.find((price) => isFixedPrice(price));
	return (
		(fixed?.config as FixedPriceConfig | undefined)?.stripe_price_id ?? null
	);
};

export const customerFixedStripePriceId = async ({
	ctx,
	customerId,
	catalogProductId,
}: {
	ctx: AutumnContext;
	customerId: string;
	catalogProductId: string;
}) => {
	const { customerPrices, catalogPrices } = await loadCustomerAndCatalogPrices({
		ctx,
		customerId,
		catalogProductId,
	});
	return {
		customerStripePriceId: fixedStripePriceId({ prices: customerPrices }),
		catalogStripePriceId: fixedStripePriceId({ prices: catalogPrices }),
	};
};

export const expectSharedFixedStripePrice = async ({
	ctx,
	customerIds,
	catalogProductId,
	notCatalog = true,
}: {
	ctx: AutumnContext;
	customerIds: string[];
	catalogProductId: string;
	notCatalog?: boolean;
}) => {
	const results = await Promise.all(
		customerIds.map((customerId) =>
			customerFixedStripePriceId({ ctx, customerId, catalogProductId }),
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

export const expectDistinctFixedStripePrices = async ({
	ctx,
	leftCustomerId,
	rightCustomerId,
	leftCatalogProductId,
	rightCatalogProductId,
}: {
	ctx: AutumnContext;
	leftCustomerId: string;
	rightCustomerId: string;
	leftCatalogProductId: string;
	rightCatalogProductId?: string;
}) => {
	const left = await customerFixedStripePriceId({
		ctx,
		customerId: leftCustomerId,
		catalogProductId: leftCatalogProductId,
	});
	const right = await customerFixedStripePriceId({
		ctx,
		customerId: rightCustomerId,
		catalogProductId: rightCatalogProductId ?? leftCatalogProductId,
	});
	expect(left.customerStripePriceId).toBeTruthy();
	expect(right.customerStripePriceId).toBeTruthy();
	expect(right.customerStripePriceId).not.toBe(left.customerStripePriceId);
	return { left, right };
};

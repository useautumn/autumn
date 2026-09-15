import { expect } from "bun:test";
import {
	AllocatedBillingBehavior,
	findPriceByFeatureId,
	type UsagePriceConfig,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

type TestCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

const getFullPlan = async ({ ctx, planId }: { ctx: TestCtx; planId: string }) =>
	await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

export const getUsersPrice = async ({
	ctx,
	planId,
}: {
	ctx: TestCtx;
	planId: string;
}) => {
	const fullProduct = await getFullPlan({ ctx, planId });
	const price = findPriceByFeatureId({
		prices: fullProduct.prices,
		featureId: TestFeature.Users,
	});
	if (!price) throw new Error("Users price not found");
	return price;
};

/** Rewrite the users price to the pre-v2 shape: prorated, no behaviour column. */
export const forceOldAllocatedV1Config = async ({
	ctx,
	planId,
}: {
	ctx: TestCtx;
	planId: string;
}) => {
	const price = await getUsersPrice({ ctx, planId });
	const { allocated_billing_behavior: _allocatedBillingBehavior, ...config } =
		price.config as UsagePriceConfig;

	await PriceService.update({
		db: ctx.db,
		id: price.id,
		update: {
			config: {
				...config,
				should_prorate: true,
			},
		},
	});
};

export const expectAllocatedV1Price = async ({
	ctx,
	planId,
}: {
	ctx: TestCtx;
	planId: string;
}) => {
	const price = await getUsersPrice({ ctx, planId });
	const config = price.config as UsagePriceConfig;
	expect(config.should_prorate).toBe(true);
	expect(config.allocated_billing_behavior).not.toBe(
		AllocatedBillingBehavior.Arrear,
	);
	expect(price.proration_config).not.toBeNull();
};

export const expectAllocatedV2Price = async ({
	ctx,
	planId,
}: {
	ctx: TestCtx;
	planId: string;
}) => {
	const price = await getUsersPrice({ ctx, planId });
	const config = price.config as UsagePriceConfig;
	expect(config.should_prorate).toBe(false);
	expect(config.allocated_billing_behavior).toBe(
		AllocatedBillingBehavior.Arrear,
	);
	expect(price.proration_config).toBeNull();
};

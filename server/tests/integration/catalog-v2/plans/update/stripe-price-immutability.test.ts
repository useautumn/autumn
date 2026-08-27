/**
 * catalogV2.update — Stripe prices are immutable: a billing-param change must
 * never keep the old stripe_price_id, even when params round-trip it
 * (createPlanItemParamsV1.price.stripe_price_id is accepted for sync flows).
 *
 * Contract:
 *   base plan: items update round-tripping the old stripe_price_id with a new
 *   amount → old id cleared, product ids kept, fresh Stripe price minted
 *   all_versions: amount change propagated to every version mints a new
 *   stripe_price_id per version (versions often share one Stripe price)
 */

import { test } from "bun:test";
import { BillingInterval, BillingMethod, type FullProduct } from "@autumn/shared";
import {
	expectPriceStripeReuseCorrect,
	expectPriceStripeResourcesPresent,
	findFeaturePrice,
} from "@tests/integration/utils/expectStripePriceResources.js";
import { initPlanStripeResources } from "@tests/integration/utils/initPlanStripeResources.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const getFull = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}): Promise<FullProduct> =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

const prepaidMessagesItem = ({
	amount,
	stripePriceId,
}: {
	amount: number;
	stripePriceId?: string;
}) => ({
	feature_id: TestFeature.Messages,
	included: 0,
	price: {
		...(stripePriceId !== undefined ? { stripe_price_id: stripePriceId } : {}),
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
	},
});

const stripePriceIdOf = (price: { config: unknown }): string => {
	const config = price.config as {
		stripe_prepaid_price_v2_id?: string | null;
		stripe_price_id?: string | null;
	};
	return (config.stripe_prepaid_price_v2_id || config.stripe_price_id)!;
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe immutability: base plan round-tripped stale stripe_price_id is not reused")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_imm_base");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Team",
						items: [prepaidMessagesItem({ amount: 10 })],
					},
				],
			});
			const before = await initPlanStripeResources({ ctx, planId });
			const beforePrice = findFeaturePrice({
				product: before,
				featureId: TestFeature.Messages,
			})!;

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							prepaidMessagesItem({
								amount: 500,
								stripePriceId: stripePriceIdOf(beforePrice),
							}),
						],
					},
				],
			});

			const after = await getFull({ ctx, planId });
			const afterPrice = findFeaturePrice({
				product: after,
				featureId: TestFeature.Messages,
			});
			expectPriceStripeReuseCorrect({
				before: beforePrice,
				after: afterPrice,
				reuse: "stripeProductOnly",
				label: "base round-tripped stale id",
			});
			expectPriceStripeResourcesPresent({
				price: afterPrice,
				label: "base round-tripped stale id mints fresh",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 stripe immutability: all_versions amount change mints new stripe price per version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_imm_allv");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Team V1",
						items: [prepaidMessagesItem({ amount: 10 })],
					},
				],
			});
			await initPlanStripeResources({ ctx, planId });
			// v2 carries v1's stripe ids in full — the shared-id danger case.
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Team V2",
						versioning: "new_version", active: true as const,
					},
				],
			});
			const v1Before = await getFull({ ctx, planId, version: 1 });
			const v2Before = await getFull({ ctx, planId, version: 2 });
			const v1BeforePrice = findFeaturePrice({
				product: v1Before,
				featureId: TestFeature.Messages,
			})!;
			const v2BeforePrice = findFeaturePrice({
				product: v2Before,
				featureId: TestFeature.Messages,
			})!;

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [prepaidMessagesItem({ amount: 500 })],
						versioning: "all_versions" as const,
					},
				],
			});

			const v1After = await getFull({ ctx, planId, version: 1 });
			const v2After = await getFull({ ctx, planId, version: 2 });
			expectPriceStripeReuseCorrect({
				before: v1BeforePrice,
				after: findFeaturePrice({
					product: v1After,
					featureId: TestFeature.Messages,
				}),
				reuse: "stripeProductOnly",
				label: "all_versions v1",
			});
			expectPriceStripeReuseCorrect({
				before: v2BeforePrice,
				after: findFeaturePrice({
					product: v2After,
					featureId: TestFeature.Messages,
				}),
				reuse: "stripeProductOnly",
				label: "all_versions v2",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

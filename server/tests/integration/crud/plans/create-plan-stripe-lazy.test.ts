/**
 * Published SDKs bake create_in_stripe: true into every plans.create request,
 * so the flag's true value carries no user intent on this route and must NOT
 * force Stripe creation — force-create is only honored on catalogV2 updates.
 */

import { expect, test } from "bun:test";
import { ApiVersion, BillingInterval, BillingMethod } from "@autumn/shared";
import {
	expectPriceStripeResourcesAbsent,
	expectProductProcessorCorrect,
	findBasePrice,
	findFeaturePrice,
} from "@tests/integration/utils/expectStripePriceResources.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });

test.concurrent(
	`${chalk.yellowBright("plans.create: create_in_stripe true (the SDK default) still creates nothing in Stripe")}`,
	async () => {
		const planId = `plan_create_lazy_${Math.random().toString(36).slice(2, 9)}`;
		try {
			await autumnRpc.plans.create({
				plan_id: planId,
				name: "SDK Default Lazy",
				price: { amount: 20, interval: BillingInterval.Month },
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 0,
						price: {
							amount: 10,
							interval: BillingInterval.Month,
							billing_method: BillingMethod.Prepaid,
							billing_units: 100,
						},
					},
				],
				create_in_stripe: true,
			});

			const plan = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: planId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expectProductProcessorCorrect({ product: plan, present: false });
			expectPriceStripeResourcesAbsent({
				price: findBasePrice({ product: plan }),
				label: "base price",
			});
			expectPriceStripeResourcesAbsent({
				price: findFeaturePrice({
					product: plan,
					featureId: TestFeature.Messages,
				}),
				label: "prepaid price",
			});
		} finally {
			await autumnRpc.plans.delete(planId).catch(() => undefined);
		}
	},
);

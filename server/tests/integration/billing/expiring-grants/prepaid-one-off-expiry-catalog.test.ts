// Expiring prepaid one-off plan items: each purchase lands in a loose, expiring grant beside a
// 0-balance keystone row; grants outlive plan changes and churn.

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	EntitlementDuration,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { EXPIRY, expiringTopUpPlan } from "./utils/prepaidOneOffExpiry";

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: expiry round-trips through catalogV2 and lands on the entitlement")}`,
	async () => {
		const planId = "expiry-catalog";
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });

		await autumnV2_3.catalogV2.update({ plans: [expiringTopUpPlan(planId)] });

		const catalog = await autumnV2_3.catalogV2.get();
		const plan = catalog.plans.find((p: { id: string }) => p.id === planId);
		expect(plan?.items?.[0]?.expiry).toEqual(EXPIRY);

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: planId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const entitlement = fullProduct.entitlements.find(
			(ent) => ent.feature.id === TestFeature.Messages,
		);
		expect(entitlement?.expiry_duration).toBe(EntitlementDuration.Month);
		expect(entitlement?.expiry_length).toBe(2);
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: rejected on a recurring item")}`,
	async () => {
		const { autumnV2_3 } = await initScenario({ setup: [], actions: [] });

		await expect(
			autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: "expiry-recurring",
						name: "Invalid",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
								price: {
									amount: 10,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.Prepaid,
									billing_units: 100,
								},
								expiry: EXPIRY,
							},
						],
					},
				],
			}),
		).rejects.toThrow();
	},
);

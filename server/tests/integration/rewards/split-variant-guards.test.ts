/**
 * Guards on the variant split: base plans are refused, and splitting twice
 * is a no-op rather than churning a second Stripe product.
 */

import { expect, test } from "bun:test";
import { BillingInterval, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { splitVariantStripeProduct } from "@/internal/products/stripeResourceUtils/splitVariantStripeProduct.js";

const seedPlan = async ({
	autumn,
	planId,
	variantId,
}: {
	autumn: { catalogV2: { update: (params: { plans: unknown[] }) => unknown } };
	planId: string;
	variantId: string;
}) =>
	autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: `Plan ${planId}`,
				price: { amount: 20, interval: BillingInterval.Month },
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						reset: { interval: ResetInterval.Month },
					},
				],
				variants: [{ variant_plan_id: variantId, name: "Variant" }],
			},
		],
	});

test.concurrent(
	`${chalk.yellowBright("split guards: refuses a base plan and is idempotent on a variant")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			customerId: "split-guards",
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "split-guards@autumn.test",
				}),
				s.customer({}),
			],
			actions: [],
		});

		const stamp = Date.now();
		const baseId = `guard_base_${stamp}`;
		const variantId = `guard_var_${stamp}`;
		await seedPlan({ autumn: autumnV2_3, planId: baseId, variantId });

		await expect(
			splitVariantStripeProduct({ ctx, variantPlanId: baseId }),
		).rejects.toThrow(/not a variant/);

		const first = await splitVariantStripeProduct({
			ctx,
			variantPlanId: variantId,
		});
		const second = await splitVariantStripeProduct({
			ctx,
			variantPlanId: variantId,
		});

		expect(first.processor?.id).toBeTruthy();
		expect(second.processor?.id).toBe(first.processor?.id as string);

		const base = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: baseId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(base.processor?.id).not.toBe(first.processor?.id);
	},
);

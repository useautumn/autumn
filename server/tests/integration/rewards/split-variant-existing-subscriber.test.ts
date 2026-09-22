/**
 * A customer already subscribed to a variant keeps the Stripe price they were
 * attached on when that variant is split onto its own Stripe product.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	BillingInterval,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { splitVariantStripeProduct } from "@/internal/products/stripeResourceUtils/splitVariantStripeProduct.js";

const baseId = "split-sub-base";
const variantId = "split-sub-variant";

test.concurrent(
	`${chalk.yellowBright("split variant: an existing subscriber keeps its original Stripe price")}`,
	async () => {
		const { autumnV2_3, customerId, ctx } = await initScenario({
			customerId: "split-existing-sub",
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "split-existing-sub@autumn.test",
				}),
				s.customer({ paymentMethod: "success" }),
			],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: baseId,
					name: "Split Sub Base",
					price: { amount: 20, interval: BillingInterval.Month },
					items: [
						{
							feature_id: TestFeature.Messages,
							included: 100,
							reset: { interval: ResetInterval.Month },
						},
					],
					variants: [{ variant_plan_id: variantId, name: "Split Sub Variant" }],
				},
			],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: variantId,
		});

		const subscription = await ctx.stripeCli.subscriptions.list({
			customer: (await autumnV2_3.customers.get<ApiCustomerV5>(customerId))
				.stripe_id as string,
		});
		const priceIdsBefore = subscription.data[0].items.data.map(
			(item) => item.price.id,
		);
		const productIdsBefore = subscription.data[0].items.data.map(
			(item) => item.price.product as string,
		);
		expect(priceIdsBefore.length).toBeGreaterThan(0);

		await splitVariantStripeProduct({ ctx, variantPlanId: variantId });

		const variantAfter = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: variantId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const baseAfter = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: baseId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		// The catalog now points at a new Stripe product.
		expect(variantAfter.processor?.id).not.toBe(baseAfter.processor?.id);

		// The live subscription is untouched, still on the original product.
		const subscriptionAfter = await ctx.stripeCli.subscriptions.retrieve(
			subscription.data[0].id,
		);
		expect(
			subscriptionAfter.items.data.map((item) => item.price.id).sort(),
		).toEqual(priceIdsBefore.sort());
		expect(
			subscriptionAfter.items.data.map((item) => item.price.product as string),
		).toEqual(productIdsBefore);
		expect(productIdsBefore).not.toContain(variantAfter.processor?.id);
		expect(subscriptionAfter.status).toBe("active");
	},
);

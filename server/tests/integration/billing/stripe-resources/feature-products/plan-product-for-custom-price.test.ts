/**
 * A customized usage price bills under the Stripe Product its plan already uses for
 * that feature, not the Feature default.
 *
 * Contract:
 *   attach with customize.items  → custom price lands on the plan's feature product
 *   update with remove/add_items → custom price lands on the plan's feature product
 */

import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	BillingMethod,
	type UpdateSubscriptionV1ParamsInput,
	type UsagePriceConfig,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { customerUsageStripePriceId } from "../utils/customerUsageStripePriceId.js";
import {
	uniqueSuffix,
	usagePriceForFeature,
} from "./utils/createUnmintedFeaturePlans.js";

/** Put the plan's Messages price on its own Stripe Product (e.g. "Enterprise - Emails"). */
const mapPlanFeatureProduct = async ({
	ctx,
	productId,
	suffix,
}: {
	ctx: TestContext;
	productId: string;
	suffix: string;
}) => {
	const planFeatureProduct = await ctx.stripeCli.products.create({
		name: `Plan feature product ${suffix}`,
	});
	const { price, config } = await usagePriceForFeature({ ctx, productId });
	await PriceService.update({
		db: ctx.db,
		id: price.id,
		update: {
			config: {
				...config,
				stripe_product_id: planFeatureProduct.id,
			} as UsagePriceConfig,
		},
	});
	return planFeatureProduct.id;
};

test.concurrent(
	`${chalk.yellowBright("feature-products: customized usage price on attach uses the plan's feature product")}`,
	async () => {
		const suffix = uniqueSuffix();
		const customerId = `fp-plan-attach-${suffix}`;
		const pro = products.pro({
			id: `fp-plan-attach-pro-${suffix}`,
			items: [items.consumableMessages({ price: 1 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro], createInStripe: false }),
			],
			actions: [],
		});

		const planFeatureProductId = await mapPlanFeatureProduct({
			ctx,
			productId: pro.id,
			suffix,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { items: [itemsV2.consumableMessages({ amount: 2 })] },
		});

		const { customerStripeProductId, customerStripePriceId } =
			await customerUsageStripePriceId({
				ctx,
				customerId,
				catalogProductId: pro.id,
				featureId: TestFeature.Messages,
			});
		expect(customerStripePriceId).toBeTruthy();
		expect(customerStripeProductId).toBe(planFeatureProductId);
	},
);

test.concurrent(
	`${chalk.yellowBright("feature-products: usage price swapped via remove/add_items on update uses the plan's feature product")}`,
	async () => {
		const suffix = uniqueSuffix();
		const customerId = `fp-plan-update-${suffix}`;
		const pro = products.pro({
			id: `fp-plan-update-pro-${suffix}`,
			items: [items.consumableMessages({ price: 1 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro], createInStripe: false }),
			],
			actions: [],
		});

		const planFeatureProductId = await mapPlanFeatureProduct({
			ctx,
			productId: pro.id,
			suffix,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				remove_items: [
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.UsageBased,
					},
				],
				add_items: [itemsV2.consumableMessages({ amount: 0.35 })],
			},
		});

		const { customerStripeProductId, customerStripePriceId } =
			await customerUsageStripePriceId({
				ctx,
				customerId,
				catalogProductId: pro.id,
				featureId: TestFeature.Messages,
			});
		expect(customerStripePriceId).toBeTruthy();
		expect(customerStripeProductId).toBe(planFeatureProductId);
	},
);

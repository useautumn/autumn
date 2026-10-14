import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	BillingInterval,
	ResetInterval,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { splitVariantStripeProduct } from "@/internal/products/stripeResourceUtils/splitVariantStripeProduct.js";

const baseId = "lifecycle-base";
const variantId = "lifecycle-variant";

const INCLUDED = 100;
const TRACKED = 30;

const beforeBase = "lifecycle-before-base";
const beforeVariant = "lifecycle-before-variant";
const afterBase = "lifecycle-after-base";
const afterVariant = "lifecycle-after-variant";

const messagesItem = {
	feature_id: TestFeature.Messages,
	included: INCLUDED,
	reset: { interval: ResetInterval.Month },
};

test.concurrent(
	`${chalk.yellowBright("split variant lifecycle: customers on both sides keep working across a split")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			customerId: beforeBase,
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "lifecycle-split@autumn.test",
				}),
				s.customer({ paymentMethod: "success" }),
				s.otherCustomers([
					{ id: beforeVariant, paymentMethod: "success" },
					{ id: afterBase, paymentMethod: "success", distinctTestClock: true },
					{
						id: afterVariant,
						paymentMethod: "success",
						distinctTestClock: true,
					},
				]),
			],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: baseId,
					name: "Lifecycle Base",
					price: { amount: 20, interval: BillingInterval.Month },
					items: [messagesItem],
					variants: [{ variant_plan_id: variantId, name: "Lifecycle Variant" }],
				},
			],
		});

		const attach = (customerId: string, planId: string) =>
			autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: planId,
			});

		const trackAndExpect = async (customerId: string) => {
			await autumnV2_3.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: TRACKED,
			});
			await expectBalanceCorrect({
				customerId,
				autumn: autumnV2_3,
				featureId: TestFeature.Messages,
				remaining: INCLUDED - TRACKED,
				usage: TRACKED,
			});
		};

		const stripeProductOf = async (customerId: string) => {
			const customer =
				await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
			const subs = await ctx.stripeCli.subscriptions.list({
				customer: customer.stripe_id as string,
			});
			return subs.data[0].items.data.map(
				(item) => item.price.product as string,
			);
		};

		await attach(beforeBase, baseId);
		await attach(beforeVariant, variantId);
		await trackAndExpect(beforeBase);
		await trackAndExpect(beforeVariant);

		const sharedProducts = await stripeProductOf(beforeVariant);
		expect(sharedProducts).toEqual(await stripeProductOf(beforeBase));

		await splitVariantStripeProduct({ ctx, variantPlanId: variantId });

		const base = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: baseId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const variant = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: variantId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(variant.processor?.id).not.toBe(base.processor?.id);

		expect(await stripeProductOf(beforeVariant)).toEqual(sharedProducts);
		expect(await stripeProductOf(beforeBase)).toEqual(sharedProducts);

		await attach(afterBase, baseId);
		await attach(afterVariant, variantId);

		expect(await stripeProductOf(afterVariant)).toContain(
			variant.processor?.id as string,
		);
		expect(await stripeProductOf(afterBase)).not.toContain(
			variant.processor?.id as string,
		);

		for (const customerId of [afterBase, afterVariant]) {
			await trackAndExpect(customerId);
		}

		for (const customerId of [
			beforeBase,
			beforeVariant,
			afterBase,
			afterVariant,
		]) {
			const check = await autumnV2_3.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
			});
			expect(check.allowed).toBe(true);

			await autumnV2_3.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			});
			await expectBalanceCorrect({
				customerId,
				autumn: autumnV2_3,
				featureId: TestFeature.Messages,
				remaining: INCLUDED - TRACKED - 10,
				usage: TRACKED + 10,
			});
		}

		await attach(beforeVariant, baseId);
		await attach(afterBase, variantId);

		expect(await stripeProductOf(afterBase)).toContain(
			variant.processor?.id as string,
		);
	},
);

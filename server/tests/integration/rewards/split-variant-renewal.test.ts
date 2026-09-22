/**
 * A subscription taken out before a variant was split must still renew on the
 * product it was created with, and bill the same amount.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	BillingInterval,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import { ProductService } from "@/internal/products/ProductService.js";
import { splitVariantStripeProduct } from "@/internal/products/stripeResourceUtils/splitVariantStripeProduct.js";

const baseId = "renewal-base";
const variantId = "renewal-variant";
const customerId = "renewal-pre-split";

const PRICE = 20;

test.concurrent(
	`${chalk.yellowBright("split variant renewal: a pre-split subscription renews on its original product")}`,
	async () => {
		const { autumnV2_3, ctx, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "renewal-pre-split@autumn.test",
				}),
				s.customer({ paymentMethod: "success" }),
			],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: baseId,
					name: "Renewal Base",
					price: { amount: PRICE, interval: BillingInterval.Month },
					items: [
						{
							feature_id: TestFeature.Messages,
							included: 100,
							reset: { interval: ResetInterval.Month },
						},
					],
					variants: [{ variant_plan_id: variantId, name: "Renewal Variant" }],
				},
			],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: variantId,
		});

		const stripeId = (await autumnV2_3.customers.get<ApiCustomerV5>(customerId))
			.stripe_id as string;
		const [subscription] = (
			await ctx.stripeCli.subscriptions.list({ customer: stripeId })
		).data;
		const productsBefore = subscription.items.data.map(
			(item) => item.price.product as string,
		);

		await splitVariantStripeProduct({ ctx, variantPlanId: variantId });

		const variant = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: variantId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(productsBefore).not.toContain(variant.processor?.id as string);

		// Cross the renewal boundary.
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId as string,
			advanceTo: addHours(
				addMonths(new Date(advancedTo), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const renewed = await ctx.stripeCli.subscriptions.retrieve(subscription.id);
		expect(renewed.status).toBe("active");
		expect(
			renewed.items.data.map((item) => item.price.product as string),
		).toEqual(productsBefore);

		// The renewal invoice bills the original price, not a re-derived one.
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const invoices = customer.invoices ?? [];
		expect(invoices.length).toBeGreaterThanOrEqual(2);
		expect(invoices[0].total).toBe(PRICE);

		// The catalog still points new attaches at the split product.
		expect(variant.processor?.id).toBeTruthy();
	},
);

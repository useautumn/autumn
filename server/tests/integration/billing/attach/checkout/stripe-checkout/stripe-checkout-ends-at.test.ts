import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	MetadataType,
} from "@autumn/shared";
import { getCustomerProduct } from "@tests/integration/billing/attach/params/start-date/utils";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import testContext from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import { MetadataService } from "@/internal/metadata/MetadataService";

test.concurrent(
	`${chalk.yellowBright("stripe-checkout: ends_at sets cancel_at and persists ended_at")}`,
	async () => {
		const customerId = "stripe-checkout-ends-at";

		const pro = products.pro({
			id: "pro-checkout-ends-at",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
			actions: [],
		});

		const endsAt = addDays(advancedTo, 7).getTime();

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			ends_at: endsAt,
		});

		expect(result.payment_url).toBeDefined();
		expect(result.payment_url).toContain("checkout.stripe.com");

		await completeStripeCheckoutForm({ url: result.payment_url });
		await timeout(15000);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectProductActive({ customer, productId: pro.id });

		const customerProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(customerProduct.ended_at).toBe(endsAt);
		expect(customerProduct.canceled).toBe(false);
		expect(customerProduct.canceled_at ?? null).toBeNull();
		expect(customerProduct.subscription_ids).toHaveLength(1);

		const stripeSubscription = await ctx.stripeCli.subscriptions.retrieve(
			customerProduct.subscription_ids![0]!,
		);
		expect(stripeSubscription.cancel_at).toBe(Math.floor(endsAt / 1000));
	},
);

test.concurrent(
	`${chalk.yellowBright("checkout metadata claim: only one concurrent executor wins")}`,
	async () => {
		const metadataId = `meta_claim_race_${Date.now()}`;

		await MetadataService.insert({
			db: testContext.db,
			data: {
				id: metadataId,
				type: MetadataType.CheckoutSessionV2,
				data: {},
			},
		});

		try {
			const claimResults = await Promise.all([
				MetadataService.claim({
					db: testContext.db,
					id: metadataId,
					fromType: MetadataType.CheckoutSessionV2,
					toType: MetadataType.CheckoutSessionV2Processing,
				}),
				MetadataService.claim({
					db: testContext.db,
					id: metadataId,
					fromType: MetadataType.CheckoutSessionV2,
					toType: MetadataType.CheckoutSessionV2Processing,
				}),
			]);

			expect(claimResults.filter(Boolean)).toHaveLength(1);

			const reverted = await MetadataService.claim({
				db: testContext.db,
				id: metadataId,
				fromType: MetadataType.CheckoutSessionV2Processing,
				toType: MetadataType.CheckoutSessionV2,
			});
			expect(reverted).toBe(true);

			const reclaimed = await MetadataService.claim({
				db: testContext.db,
				id: metadataId,
				fromType: MetadataType.CheckoutSessionV2,
				toType: MetadataType.CheckoutSessionV2Processing,
			});
			expect(reclaimed).toBe(true);
		} finally {
			await MetadataService.delete({ db: testContext.db, id: metadataId });
		}
	},
);

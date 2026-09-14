/**
 * A line added directly in Stripe has no Autumn price behind it:
 * plan_id / feature_id / quantity null, entities [].
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiListInvoiceV1 } from "@autumn/shared";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const ONBOARDING_FEE = 500;

test.concurrent(
	`${chalk.yellowBright("entity-li: custom Stripe line → nulls and entities []")}`,
	async () => {
		const customerId = "entity-li-custom-line";
		const pro = products.pro({
			id: "pro-custom",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_3, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
				],
				actions: [s.billing.attach({ productId: pro.id, entityIndex: 0 })],
			});

		const before = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await ctx.stripeCli.invoiceItems.create({
			customer: before.stripe_id!,
			amount: ONBOARDING_FEE * 100,
			currency: "usd",
			description: "Onboarding fee",
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
			withPause: true,
		});

		const after = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const renewalStripeId = after.invoices![0].stripe_id;
		const rows = await waitForInvoiceLineItems({
			stripeInvoiceId: renewalStripeId,
		});

		const custom = rows.find((li) => li.description === "Onboarding fee")!;
		expect(custom).toBeDefined();
		expect(custom.amount).toBe(ONBOARDING_FEE);
		expect(custom.product_id).toBeNull();
		expect(custom.feature_id).toBeNull();
		expect(custom.entities).toEqual([]);

		const { list } = (await autumnV2_3.post("/invoices.list", {
			customer_id: customerId,
		})) as {
			list: ApiListInvoiceV1[];
		};
		const item = list
			.find((i) => i.stripe_id === renewalStripeId)!
			.items!.find((i) => i.description === "Onboarding fee")!;
		expect(item).toMatchObject({
			plan_id: null,
			feature_id: null,
			feature_name: null,
			quantity: null,
			amount: ONBOARDING_FEE,
			entities: [],
		});
	},
);

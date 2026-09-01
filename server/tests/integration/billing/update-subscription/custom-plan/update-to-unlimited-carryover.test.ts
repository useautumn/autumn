/**
 * Editing a plan's included grant to `unlimited` must not bill the usage that
 * was already covered by that grant.
 *
 * The plan carries two items for one feature: a free included grant, and a
 * separate metered price for overage. Flipping the grant to unlimited makes
 * the carried usage un-billable by definition, but the carryover deducts it
 * across the new product's entitlements and the metered row is the only one
 * that keeps a negative balance.
 *
 * Red (current):  upcoming invoice gains a MESSAGES_TRACKED x OVERAGE_PRICE line
 * Green (after):  no messages line — unlimited absorbs the carried usage
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, CustomerExpand } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const MESSAGES_INCLUDED = 100;
const MESSAGES_TRACKED = 100;
const OVERAGE_PRICE = 0.5;

test.concurrent(
	`${chalk.yellowBright("p2p: included grant -> unlimited does not bill already-covered usage")}`,
	async () => {
		const grantItem = items.monthlyMessages({
			includedUsage: MESSAGES_INCLUDED,
		});
		const meteredItem = items.consumableMessages({
			includedUsage: 0,
			price: OVERAGE_PRICE,
		});
		const pro = products.pro({
			id: "unlim-carry-pro",
			items: [grantItem, meteredItem],
		});

		const customerId = "update-to-unlimited-carryover";

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				// Consume exactly the included grant: zero overage before the edit.
				s.track({
					featureId: TestFeature.Messages,
					value: MESSAGES_TRACKED,
					timeout: 2000,
				}),
			],
		});

		const beforeEdit = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ expand: [CustomerExpand.InvoicePreviews] },
		);
		const messagesLineBefore =
			beforeEdit.invoice_previews?.[0]?.line_items.find(
				(lineItem) => lineItem.feature_id === TestFeature.Messages,
			);
		expect(
			messagesLineBefore?.subtotal ?? 0,
			"precondition: usage is fully covered by the grant, so nothing is billable",
		).toBe(0);

		// The edit: included grant becomes unlimited, metered price stays.
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			items: [items.unlimitedMessages(), meteredItem],
		});

		const afterEdit = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{
				expand: [CustomerExpand.InvoicePreviews],
			},
		);
		const messagesLineAfter = afterEdit.invoice_previews?.[0]?.line_items.find(
			(lineItem) => lineItem.feature_id === TestFeature.Messages,
		);

		expect(
			messagesLineAfter?.subtotal ?? 0,
			"usage covered by the old grant must not become billable overage",
		).toBe(0);
	},
);

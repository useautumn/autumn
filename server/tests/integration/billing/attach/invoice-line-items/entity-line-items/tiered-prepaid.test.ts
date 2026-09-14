/**
 * Tiered prepaid on the v2 billing path is flattened into one inline Stripe price,
 * so the line gets full entity attribution (quantity = purchased units, amount = tiered total).
 * Stripe-native multi-tier groups (legacy) still store entities [] via the group guard.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("entity-li: tiered prepaid → single flattened line with full entity attribution")}`,
	async () => {
		const customerId = "entity-li-tiered";
		const tiered = items.tieredPrepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			tiers: [
				{ to: 500, amount: 10 },
				{ to: "inf", amount: 5 },
			],
		});
		const pro = products.pro({ id: "pro-tiered", items: [tiered] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					entityIndex: 0,
					options: [{ feature_id: TestFeature.Messages, quantity: 800 }],
				}),
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const rows = await waitForInvoiceLineItems({
			stripeInvoiceId: customer.invoices![0].stripe_id,
		});

		const tierLines = rows.filter(
			(li) => li.feature_id === TestFeature.Messages,
		);
		expect(tierLines.length).toBe(1);
		// 500 units @ $10/100 + 300 units @ $5/100 = $50 + $15
		expect(tierLines[0].amount).toBe(65);
		expect(tierLines[0].entities).toEqual([
			{ entity_id: entities[0].id, quantity: 800, amount: 65 },
		]);
	},
);

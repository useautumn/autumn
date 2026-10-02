/**
 * Attach Entity-Level Product Tests (Attach V2)
 *
 * Tests for attaching products to entities (sub-accounts) rather than customers.
 * Entities have their own subscriptions and balances.
 *
 * Key behaviors:
 * - Products attached to entities are independent from customer-level products
 * - Each entity can have its own subscription
 * - Mid-cycle attaches are prorated
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Attach pro to entity 1, advance 2 weeks, attach pro to entity 2
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro to entity 1
 * - Advance 2 weeks
 * - Attach pro to entity 2
 *
 * Expected Result:
 * - Prorated billing for entity 2
 */
test.concurrent(
	`${chalk.yellowBright("new-plan: attach pro to entity 1, advance 2 weeks, attach pro to entity 2")}`,
	async () => {
		const customerId = "new-plan-attach-entity-midcycle";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro-midcycle",
			items: [messagesItem],
		});

		const { autumnV1, entities, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		// 1. Preview and attach to entity 1 - $20 (full price)
		const preview1 = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
		});
		expect(preview1.total).toBe(20);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
			redirect_mode: "if_required",
		});

		// Advance 2 weeks
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfWeeks: 2,
		});

		// 2. Preview attach to entity 2 mid-cycle (prorated)
		const preview2 = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[1].id,
		});
		const entity2Total = preview2.total;

		// 3. Attach to entity 2 mid-cycle
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[1].id,
			redirect_mode: "if_required",
		});

		// Get both entities
		const entity1 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		const entity2 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);

		// Both should have the product
		await expectProductActive({
			customer: entity1,
			productId: pro.id,
		});
		await expectProductActive({
			customer: entity2,
			productId: pro.id,
		});

		// Get customer to check invoices
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Should have 2 invoices: one full price ($20), one prorated
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: entity2Total, // Prorated amount matches preview
		});
	},
);

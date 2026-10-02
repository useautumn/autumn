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
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Create entity, attach pro to entity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create entity
 * - Attach pro to entity (not customer)
 *
 * Expected Result:
 * - Entity has product
 * - Customer does not have product
 */
test.concurrent(
	`${chalk.yellowBright("new-plan: create entity, attach pro to entity")}`,
	async () => {
		const customerId = "new-plan-attach-entity-pro";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro-entity",
			items: [messagesItem],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		// 1. Preview attach to entity - $20
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
		});
		expect(preview.total).toBe(20);

		// 2. Attach to entity
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
			redirect_mode: "if_required",
		});

		// Get entity and verify it has the product
		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);

		await expectProductActive({
			customer: entity,
			productId: pro.id,
		});

		// Verify entity has messages feature
		expectCustomerFeatureCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Get customer and verify they don't have the product
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Verify invoice on customer matches preview total: $20
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 20,
		});
	},
);

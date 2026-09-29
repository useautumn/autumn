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
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Attach pro to customer, then pro to entity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro to customer first
 * - Then attach pro to entity
 *
 * Expected Result:
 * - Both have product independently
 */
test.concurrent(
	`${chalk.yellowBright("new-plan: attach pro to customer, then pro to entity")}`,
	async () => {
		const customerId = "new-plan-attach-cust-then-entity";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro-cust-ent",
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

		// 1. Preview and attach to customer - $20
		const previewCust = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
		});
		expect(previewCust.total).toBe(20);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		// 2. Preview and attach to entity - $20
		const previewEnt = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
		});
		expect(previewEnt.total).toBe(20);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
			redirect_mode: "if_required",
		});

		// Get customer and entity
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);

		// Both should have the product
		await expectProductActive({
			customer,
			productId: pro.id,
		});
		await expectProductActive({
			customer: entity,
			productId: pro.id,
		});

		// Features are inherited across scopes: customer (100) + entity (100) = 200
		// The balance worker doesn't aggregate entity data onto the customer.
		if (!isBalanceWorkerRoute()) {
			expectCustomerFeatureCorrect({
				customer,
				featureId: TestFeature.Messages,
				includedUsage: 200,
				balance: 200,
				usage: 0,
			});
		}
		expectCustomerFeatureCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			includedUsage: 200,
			balance: 200,
			usage: 0,
		});

		// Verify 2 invoices, each $20
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 20,
		});
	},
);

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
// TEST 6: Attach free to customer, then free to entity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach free to customer first
 * - Then attach free to entity
 *
 * Expected Result:
 * - Both have product independently
 */
test.concurrent(
	`${chalk.yellowBright("new-plan: attach free to customer, then free to entity")}`,
	async () => {
		const customerId = "new-plan-attach-free-cust-ent";

		const messagesItem = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({
			id: "free-cust-ent",
			items: [messagesItem],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({}),
				s.products({ list: [free] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		// 1. Preview and attach to customer - $0 (free)
		const previewCust = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: free.id,
		});
		expect(previewCust.total).toBe(0);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			redirect_mode: "if_required",
		});

		// 2. Preview and attach to entity - $0 (free)
		const previewEnt = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: free.id,
			entity_id: entities[0].id,
		});
		expect(previewEnt.total).toBe(0);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
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
			productId: free.id,
		});
		await expectProductActive({
			customer: entity,
			productId: free.id,
		});

		// Features are inherited across scopes: customer (50) + entity (50) = 100
		// The balance worker doesn't aggregate entity data onto the customer.
		if (!isBalanceWorkerRoute()) {
			expectCustomerFeatureCorrect({
				customer,
				featureId: TestFeature.Messages,
				includedUsage: 100,
				balance: 100,
				usage: 0,
			});
		}
		expectCustomerFeatureCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Verify no invoices (both free) - matches preview total of 0
		await expectCustomerInvoiceCorrect({
			customer,
			count: 0,
		});
	},
);

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
import { calculateCrossIntervalUpgrade } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Entity has monthly, add customer-level annual (different scopes)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has pro monthly ($20/mo)
 * - Advance 1 month + 15 days (1.5 months total)
 * - Add customer-level enterprise annual ($500/yr)
 *
 * Expected Result:
 * - Entity KEEPS its monthly (different scope, not replaced)
 * - Customer gets annual product
 * - No refund from entity products (different scope)
 * - Total: $500 (full annual, no credit)
 *
 * Timeline:
 * - Day 0: Entity attaches pro monthly ($20)
 * - Day 30: Monthly renews ($20)
 * - Day 45: Add customer annual ($500 - no credit from entity scope)
 */
test.concurrent(
	`${chalk.yellowBright("new-plan: entity monthly, add customer annual (different scopes)")}`,
	async () => {
		const customerId = "new-plan-ent-monthly-cust-annual";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const proMonthly = products.pro({
			id: "pro-monthly",
			items: [proMessages],
		});

		// Enterprise annual at customer level ($500/yr)
		const enterpriseMessages = items.monthlyMessages({ includedUsage: 10000 });
		const enterpriseAnnual = products.base({
			id: "enterprise-annual",
			items: [enterpriseMessages, items.annualPrice({ price: 500 })],
		});

		const { autumnV1, entities, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proMonthly, enterpriseAnnual] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: proMonthly.id, entityIndex: 0 }),
				// Advance 1 month to trigger renewal, then 15 more days
				s.advanceTestClock({ months: 1 }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		// Verify entity still has monthly before adding customer product
		const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		await expectProductActive({
			customer: entityBefore,
			productId: proMonthly.id,
		});

		// Calculate expected total using cross-interval proration utility
		const expectedTotal = await calculateCrossIntervalUpgrade({
			customerId,
			advancedTo,
			// oldAmount: 20, // Entity monthly price
			newAmount: 500, // Customer annual price
		});

		// 1. Preview adding customer-level annual (prorated with credit from entity)
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: enterpriseAnnual.id,
			// No entity_id - this is customer-level
		});

		// Prorated annual charge with credit from entity monthly
		expect(preview.total).toBeCloseTo(expectedTotal, 0);

		// 2. Attach enterprise annual at customer level
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: enterpriseAnnual.id,
			redirect_mode: "if_required",
		});

		// Get customer and entity
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);

		// Customer has enterprise annual
		await expectProductActive({
			customer,
			productId: enterpriseAnnual.id,
		});

		// Entity STILL has monthly (different scope, not replaced)
		await expectProductActive({
			customer: entity,
			productId: proMonthly.id,
		});

		// Verify features at customer level: customer (10000) + entity (500) = 10500
		// The balance worker doesn't aggregate entity data onto the customer.
		if (!isBalanceWorkerRoute()) {
			expectCustomerFeatureCorrect({
				customer,
				featureId: TestFeature.Messages,
				includedUsage: 10500,
				balance: 10500,
				usage: 0,
			});
		}

		// Verify invoices:
		// 1. Entity monthly ($20)
		// 2. Entity monthly renewal ($20)
		// 3. Customer annual (prorated with entity credit)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 3,
			latestTotal: preview.total,
		});
	},
);

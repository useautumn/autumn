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
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Entity has monthly + add-on, add customer-level annual (different scopes)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has pro monthly ($20/mo) + storage add-on monthly ($10/mo)
 * - Add customer-level enterprise annual ($500/yr)
 *
 * Expected Result:
 * - Entity KEEPS both products (different scope, not replaced)
 * - Customer gets annual product
 * - No refund from entity products (different scope)
 * - Total: $500 (full annual, no credit)
 */
test.concurrent(
	`${chalk.yellowBright("new-plan: entity monthly + add-on, add customer annual (different scopes)")}`,
	async () => {
		const customerId = "new-plan-ent-addon-cust-annual";

		// Pro monthly ($20/mo)
		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const proMonthly = products.pro({
			id: "pro-monthly",
			items: [proMessages],
		});

		// Storage add-on monthly ($10/mo)
		const storageItem = items.monthlyMessages({ includedUsage: 1000 });
		const storageAddOn = products.base({
			id: "storage-addon",
			isAddOn: true,
			items: [storageItem, items.monthlyPrice({ price: 10 })],
		});

		// Enterprise annual bundle at customer level ($500/yr)
		const enterpriseMessages = items.monthlyMessages({ includedUsage: 10000 });
		const enterpriseAnnual = products.base({
			id: "enterprise-annual",
			items: [enterpriseMessages, items.annualPrice({ price: 500 })],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proMonthly, storageAddOn, enterpriseAnnual] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: proMonthly.id, entityIndex: 0 }),
				s.billing.attach({ productId: storageAddOn.id, entityIndex: 0 }),
			],
		});

		// Verify entity has both products before adding customer product
		const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		await expectCustomerProducts({
			customer: entityBefore,
			active: [proMonthly.id, storageAddOn.id],
		});

		// 1. Preview adding customer-level annual (no refund from entity scope)
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: enterpriseAnnual.id,
		});

		// Full annual charge - NO credit from entity products (different scope)
		expect(preview.total).toBe(500);

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

		// Entity STILL has both products (different scope, not replaced)
		await expectCustomerProducts({
			customer: entity,
			active: [proMonthly.id, storageAddOn.id],
		});

		// Verify features at customer level: customer (10000) + entity pro (500) + entity addon (1000) = 11500
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 11500,
			balance: 11500,
			usage: 0,
		});

		// Verify invoices:
		// 1. Entity pro monthly ($20)
		// 2. Entity storage add-on ($10)
		// 3. Customer annual ($500)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 3,
			latestTotal: 500,
		});
	},
);

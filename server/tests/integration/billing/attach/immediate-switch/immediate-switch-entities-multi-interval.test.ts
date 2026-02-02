/**
 * Immediate Switch Entity Multi-Interval Tests (Attach V2)
 *
 * Tests for entity-level to customer-level upgrades involving billing interval changes.
 * Common scenario: Self-serve monthly plans at entity level → Enterprise annual at customer level.
 *
 * Key behaviors:
 * - Entity products are replaced by customer-level products
 * - Monthly credit is applied, annual is charged
 * - Proration calculated correctly across intervals
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Both entities pro monthly, upgrade one to pro annual
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities have pro monthly
 * - Upgrade entity 2 to pro annual
 *
 * Expected Result:
 * - Entity 1 still monthly, entity 2 is annual
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-entities-multi-interval 1: both pro monthly, upgrade one to annual")}`, async () => {
	const customerId = "imm-switch-ent-pro-monthly-annual";

	const proMessages = items.monthlyMessages({ includedUsage: 500 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [proMessages],
	});

	const proAnnualMessages = items.monthlyMessages({ includedUsage: 500 });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [proAnnualMessages],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proMonthly, proAnnual] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: proMonthly.id, entityIndex: 0 }),
			s.billing.attach({ productId: proMonthly.id, entityIndex: 1 }),
		],
	});

	// 1. Preview upgrade entity 2 to annual
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
		entity_id: entities[1].id,
	});
	// $200 - $20 = $180
	expect(preview.total).toBe(180);

	// 2. Upgrade entity 2
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
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

	// Entity 1 still has monthly
	await expectProductActive({
		customer: entity1,
		productId: proMonthly.id,
	});

	// Entity 2 has annual
	await expectCustomerProducts({
		customer: entity2,
		active: [proAnnual.id],
		notPresent: [proMonthly.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity monthly → Customer-level annual after 1.5 months
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has pro monthly ($20/mo)
 * - Advance 1 month + 15 days (1.5 months total)
 * - Attach customer-level enterprise annual ($500/yr)
 *
 * Expected Result:
 * - Entity monthly is replaced by customer annual
 * - Proration: credit for remaining ~15 days of monthly (~$10)
 * - Total: $500 - ~$10 = ~$490
 *
 * Timeline:
 * - Day 0: Entity attaches pro monthly ($20)
 * - Day 30: Monthly renews ($20)
 * - Day 45: Upgrade to customer annual
 *   - Credit for 15 days remaining on monthly
 *   - Charge full annual $500
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-entities-multi-interval 2: entity monthly → customer annual after 1.5 months")}`, async () => {
	const customerId = "imm-switch-ent-monthly-cust-annual";

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

	const { autumnV1, entities } = await initScenario({
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

	// At this point: 1 month + 15 days since entity attached monthly
	// Entity is mid-cycle on second month

	// Verify entity still has monthly before upgrade
	const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entityBefore,
		productId: proMonthly.id,
	});

	// Expected proration:
	// Second month started 15 days ago, ~15 days remaining
	// Credit for remaining monthly: ~$10 (half of $20)

	// 1. Preview upgrade to customer-level annual
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: enterpriseAnnual.id,
		// No entity_id - this is customer-level
	});

	// Annual $500 - monthly credit ~$10 = ~$490
	expect(preview.total).toBeGreaterThan(485);
	expect(preview.total).toBeLessThan(495);

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

	// Entity no longer has monthly (replaced by customer-level)
	await expectProductNotPresent({
		customer: entity,
		productId: proMonthly.id,
	});

	// Verify features at customer level
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 10000,
		balance: 10000,
		usage: 0,
	});

	// Verify invoices:
	// 1. Entity monthly ($20)
	// 2. Entity monthly renewal ($20)
	// 3. Customer annual upgrade (~$490)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Entity monthly + add-on → Customer annual bundle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has pro monthly ($20/mo) + storage add-on monthly ($10/mo)
 * - Upgrade to customer-level enterprise annual ($500/yr) that includes storage
 *
 * Expected Result:
 * - Both entity products replaced by customer annual
 * - Credits for both monthly products applied
 * - Total: $500 - $20 - $10 = $470
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-entities-multi-interval 3: entity monthly + add-on → customer annual bundle")}`, async () => {
	const customerId = "imm-switch-ent-monthly-addon-cust-annual";

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

	// Enterprise annual bundle at customer level ($500/yr, includes storage)
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

	// Verify entity has both products before upgrade
	const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entityBefore,
		active: [proMonthly.id, storageAddOn.id],
	});

	// 1. Preview upgrade to customer-level annual
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: enterpriseAnnual.id,
	});

	// Annual $500 - pro credit $20 - storage credit $10 = $470
	expect(preview.total).toBe(470);

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

	// Entity no longer has monthly products
	await expectCustomerProducts({
		customer: entity,
		notPresent: [proMonthly.id, storageAddOn.id],
	});

	// Verify features at customer level
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 10000,
		balance: 10000,
		usage: 0,
	});

	// Verify invoices:
	// 1. Entity pro monthly ($20)
	// 2. Entity storage add-on ($10)
	// 3. Customer annual upgrade ($470)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 470,
	});
});

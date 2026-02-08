/**
 * Custom Plan Entity Tests (Attach V2)
 *
 * Tests for the `items` parameter in billing.attach when attaching products
 * at the entity level with custom configuration.
 *
 * Key behaviors:
 * - Entity with custom price
 * - Entity upgrade/downgrade inversion via custom price
 * - Entity add-on with custom config
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY-LEVEL CUSTOM PLAN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Test 1: Entity with custom price
 *
 * Scenario:
 * - Entity attaches Pro product ($20 base)
 * - Attach with custom price $25
 *
 * Expected:
 * - Entity charged $25
 * - Customer unaffected
 */
test.concurrent(`${chalk.yellowBright("custom-plan-entity 1: entity with custom price")}`, async () => {
	const customerId = "custom-plan-entity-custom-price";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const entityId = entities[0].id;

	// Attach with custom price $25
	const customPrice = items.monthlyPrice({ price: 25 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		entity_id: entityId,
		product_id: pro.id,
		items: [messagesItem, customPrice],
	});

	expect(preview.total).toBe(25);

	await autumnV1.billing.attach({
		customer_id: customerId,
		entity_id: entityId,
		product_id: pro.id,
		items: [messagesItem, customPrice],
		redirect_mode: "if_required",
	});

	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer: entity, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer: entity,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 25,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Test 2: Entity upgrade becomes downgrade via custom price
 *
 * Scenario:
 * - Entity on Pro ($20/mo)
 * - Attach Premium ($50/mo base) with custom price $15/mo
 *
 * Expected:
 * - Treated as downgrade (scheduled)
 * - Pro canceling, Premium scheduled
 */
test.concurrent(`${chalk.yellowBright("custom-plan-entity 2: entity upgrade becomes downgrade via custom price")}`, async () => {
	const customerId = "custom-plan-entity-upgrade-to-downgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({ id: "pro", items: [messagesItem, proPrice] });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const { autumnV1, ctx, entities, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	// Verify entity is on Pro
	const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entityId,
	);
	await expectProductActive({ customer: entityBefore, productId: pro.id });

	// Attach Premium with custom price $15 (lower than Pro's $20)
	const lowerPrice = items.monthlyPrice({ price: 15 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		entity_id: entityId,
		product_id: premium.id,
		items: [messagesItem, lowerPrice],
	});

	// Should be scheduled (downgrade), no immediate charge
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		total: 15,
		startsAt: addMonths(advancedTo, 1).getTime(),
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		entity_id: entityId,
		product_id: premium.id,
		items: [messagesItem, lowerPrice],
		redirect_mode: "if_required",
	});

	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);

	// Pro should be canceling, Premium should be scheduled
	await expectProductCanceling({ customer: entity, productId: pro.id });
	await expectProductScheduled({
		customer: entity,
		productId: premium.id,
		startsAt: addMonths(advancedTo, 1).getTime(),
	});

	// Only initial Pro invoice
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Test 3: Entity add-on with custom config
 *
 * Scenario:
 * - Entity on Pro ($20/mo)
 * - Attach free add-on with custom price $5/mo
 *
 * Expected:
 * - Entity charged $5 for add-on
 * - Both Pro and add-on active on entity
 */
test.concurrent(`${chalk.yellowBright("custom-plan-entity 3: entity addon with custom config")}`, async () => {
	const customerId = "custom-plan-entity-addon";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	// Free add-on
	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const addon = products.base({
		id: "addon",
		items: [wordsItem],
		isAddOn: true,
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	// Verify entity is on Pro
	const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entityId,
	);
	await expectProductActive({ customer: entityBefore, productId: pro.id });

	// Attach free add-on with custom price $5/mo
	const addonPrice = items.monthlyPrice({ price: 5 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		entity_id: entityId,
		product_id: addon.id,
		items: [wordsItem, addonPrice],
	});

	expect(preview.total).toBe(5);

	await autumnV1.billing.attach({
		customer_id: customerId,
		entity_id: entityId,
		product_id: addon.id,
		items: [wordsItem, addonPrice],
		redirect_mode: "if_required",
	});

	await timeout(2000);

	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);

	// Both Pro and add-on active on entity
	await expectCustomerProducts({
		customer: entity,
		active: [pro.id, addon.id],
	});

	// Messages from Pro
	expectCustomerFeatureCorrect({
		customer: entity,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Words from add-on
	expectCustomerFeatureCorrect({
		customer: entity,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// 2 invoices: Pro ($20) + add-on ($5)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 5,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Immediate Switch Entity Multi-Interval Tests (Attach V2)
 *
 * Tests for entity-level upgrades involving billing interval changes.
 * Same scope (entity → entity) with different intervals.
 *
 * Key behaviors:
 * - Monthly to annual on same entity = immediate switch with credit
 * - Proration calculated correctly across intervals
 */

import { expect, test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
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
// TEST 1: Both entities pro monthly, upgrade one to pro annual
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities have pro monthly
 * - Upgrade entity 2 to pro annual
 *
 * Expected Result:
 * - Entity 1 still monthly, entity 2 is annual
 * - Credit for monthly applied to annual charge
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

	// 1. Preview upgrade entity 2 to annual (same scope = immediate switch with credit)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
		entity_id: entities[1].id,
	});
	// Annual $200 - monthly credit $20 = $180
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

	// Entity 2 has annual (monthly replaced)
	await expectCustomerProducts({
		customer: entity2,
		active: [proAnnual.id],
		notPresent: [proMonthly.id],
	});
});

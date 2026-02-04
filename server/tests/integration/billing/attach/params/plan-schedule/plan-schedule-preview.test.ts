/**
 * Plan Schedule Preview Tests (Attach V2)
 *
 * Tests for preview behavior with plan_schedule parameter.
 *
 * Key behaviors:
 * - Preview with plan_schedule: "end_of_cycle" on upgrade shows total=0 and next_cycle info
 * - Preview with plan_schedule: "immediate" on downgrade shows credit/negative total
 */

import { expect, test } from "bun:test";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: Preview scheduled upgrade
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Preview upgrade to premium with plan_schedule: "end_of_cycle"
 *
 * Expected Result:
 * - total = 0 (no immediate charge)
 * - next_cycle.total = $50
 * - next_cycle.starts_at = renewal date
 */
test.concurrent(`${chalk.yellowBright("plan-schedule-preview 9: preview scheduled upgrade")}`, async () => {
	const customerId = "plan-sched-preview-upgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Verify initial subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Preview scheduled upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		plan_schedule: "end_of_cycle",
	});

	// No immediate charge
	expect(preview.total).toBe(0);

	// Next cycle should show premium price at renewal
	expectPreviewNextCycleCorrect({
		preview,
		total: 50,
		startsAt: addMonths(advancedTo, 1).getTime(),
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10: Preview immediate downgrade
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Preview downgrade to pro with plan_schedule: "immediate"
 *
 * Expected Result:
 * - total is negative or low (credit for unused premium minus pro charge)
 * - No next_cycle scheduling (immediate change)
 */
test.concurrent(`${chalk.yellowBright("plan-schedule-preview 10: preview immediate downgrade")}`, async () => {
	const customerId = "plan-sched-preview-downgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	// Verify initial subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Preview immediate downgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		plan_schedule: "immediate",
	});

	// Immediate downgrade: pro charge ($20) minus credit for unused premium (~$50)
	// Should result in negative or small total
	expect(preview.total).toBeLessThan(20);

	// For immediate changes, next_cycle should reflect the new product price
	// (not a scheduled change, but the next regular renewal)
	if (preview.next_cycle) {
		expect(preview.next_cycle.total).toBe(20); // Pro price at next renewal
	}
});

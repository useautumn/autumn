/**
 * Legacy Merge Interval Tests
 *
 * Migrated from:
 * - server/tests/interval/multiSub/multiSubInterval1.test.ts (entity attach mid-cycle interval alignment)
 * - server/tests/interval/multiSub/multiSubInterval2.test.ts (entity attach annual after 1 cycle)
 * - server/tests/interval/multiSub/multiSubInterval3.test.ts (entity attach annual with monthly usage)
 *
 * Tests V1 attach (s.attach) behavior for:
 * - Billing interval alignment for entity subscriptions
 * - next_cycle verification for entity-level attaches
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths, addYears, differenceInDays } from "date-fns";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { getCusSub } from "@/utils/scriptUtils/testUtils/cusTestUtils";
import { toMilliseconds } from "@/utils/timeUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Entity attach mid-cycle - verify billing interval alignment
// (from multiSubInterval1)
//
// Scenario:
// - Pro ($20/month) with Words feature
// - 2 entities
// - Attach Pro to customer (creates subscription)
// - Advance clock 2 weeks (mid-cycle)
// - Attach Pro to entity 2
//
// Expected:
// - Entity 2's next_cycle aligns with customer's existing billing cycle (~1 month from start)
// - Stripe subscription period_end matches next_cycle
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-merge-interval 1: entity attach mid-cycle interval alignment")}`, async () => {
	const customerId = "legacy-merge-interval-1";

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ weeks: 2 }),
		],
	});

	// Get checkout preview for entity 2
	const checkoutRes = await autumnV1.checkout({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
	});

	expect(checkoutRes.next_cycle).toBeDefined();
	expect(checkoutRes.next_cycle?.starts_at).toBeCloseTo(
		addMonths(new Date(), 1).getTime(),
		-Math.log10(toMilliseconds.days(1)),
	);

	// Attach Pro to entity 2
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
	});

	// Verify Stripe subscription period_end matches
	const sub = await getCusSub({
		ctx,
		customerId,
		productId: pro.id,
	});

	const subItem = sub!.items.data[0];
	expect(subItem.current_period_end * 1000).toBeCloseTo(
		checkoutRes.next_cycle?.starts_at ?? 0,
		-Math.log10(toMilliseconds.days(1)),
	);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity attach annual after 1 cycle
// (from multiSubInterval2)
//
// Scenario:
// - Pro ($20/month) and Pro Annual ($200/year) with Words feature
// - 2 entities
// - Attach Pro monthly to customer
// - Advance clock 1 month (past first cycle)
// - Attach Pro Annual to entity 2
//
// Expected:
// - Entity 2's annual subscription next_cycle ≈ 1 year from now
// - Stripe subscription period_end matches next_cycle
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-merge-interval 2: entity attach annual after 1 cycle")}`, async () => {
	const customerId = "legacy-merge-interval-2";

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [wordsItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, proAnnual] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ months: 1 }),
		],
	});

	// Get checkout preview for entity 2 with Pro Annual
	const checkoutRes = await autumnV1.checkout({
		customer_id: customerId,
		product_id: proAnnual.id,
		entity_id: entities[1].id,
	});

	expect(checkoutRes.next_cycle).toBeDefined();
	const expectedDate = addYears(Date.now(), 1).getTime();
	const actualDate = checkoutRes.next_cycle?.starts_at ?? 0;
	const daysDiff = Math.abs(differenceInDays(expectedDate, actualDate));
	expect(daysDiff).toBeLessThanOrEqual(1);

	// Attach Pro Annual to entity 2
	await autumnV1.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		entity_id: entities[1].id,
	});

	// Verify Stripe subscription period_end matches
	const sub = await getCusSub({
		ctx,
		customerId,
		productId: proAnnual.id,
	});

	const latestPeriodEnd = getLatestPeriodEnd({ sub });
	expect(latestPeriodEnd * 1000).toBeCloseTo(
		checkoutRes.next_cycle?.starts_at ?? 0,
		-Math.log10(toMilliseconds.days(1)),
	);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Entity attach annual with monthly usage price
// (from multiSubInterval3)
//
// Scenario:
// - Pro ($20/month) with Words feature
// - Pro Annual ($200/year) with Credits (arrear/monthly usage) + Words feature
// - 2 entities
// - Attach Pro monthly to customer
// - Advance clock 1.5 months
// - Attach Pro Annual to entity 2
//
// Expected:
// - Entity 2's annual subscription next_cycle ≈ 1 year from now
// - At least one Stripe subscription item has matching period_end
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-merge-interval 3: entity attach annual with monthly usage")}`, async () => {
	const customerId = "legacy-merge-interval-3";

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const creditsItem = items.consumable({ featureId: TestFeature.Credits });
	const pro = products.pro({ id: "pro", items: [wordsItem] });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [creditsItem, wordsItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, proAnnual] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ weeks: 6 }),
		],
	});

	// Get checkout preview for entity 2 with Pro Annual
	const checkoutRes = await autumnV1.checkout({
		customer_id: customerId,
		product_id: proAnnual.id,
		entity_id: entities[1].id,
	});

	expect(checkoutRes.next_cycle).toBeDefined();
	expect(checkoutRes.next_cycle?.starts_at).toBeCloseTo(
		addYears(new Date(), 1).getTime(),
		-Math.log10(toMilliseconds.days(1)),
	);

	// Attach Pro Annual to entity 2
	await autumnV1.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		entity_id: entities[1].id,
	});

	// Verify at least one subscription item has matching period_end
	const sub = await getCusSub({
		ctx,
		customerId,
		productId: proAnnual.id,
	});

	const periodEndExists = sub!.items.data.some(
		(item) =>
			Math.abs(
				differenceInDays(
					item.current_period_end * 1000,
					checkoutRes.next_cycle?.starts_at ?? 0,
				),
			) < 1,
	);

	expect(periodEndExists).toBe(true);
});

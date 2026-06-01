import { expect, test } from "bun:test";

import {
	type ApiCustomerV3,
	type ApiEventsListResponse,
	ResetInterval,
	type TrackDeduction,
	type TrackResponseV3,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { timeout } from "@tests/utils/genUtils.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";

const findDeductionByFeature = (
	deductions: TrackDeduction[] | undefined,
	featureId: string,
): TrackDeduction | undefined =>
	deductions?.find((deduction) => deduction.feature_id === featureId);

// ═══════════════════════════════════════════════════════════════════
// A: Track within a feature's own allowance — only the main balance
//    is touched. Linked credit systems serve as overflow only and
//    stay untouched while allowance remains.
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("track-deductions-A: within-allowance track surfaces a single deduction against the main balance")}`,
	async () => {
		const action1Item = items.free({
			featureId: TestFeature.Action1,
			includedUsage: 100,
		});
		const creditsItem = items.free({
			featureId: TestFeature.Credits,
			includedUsage: 200,
		});
		const freeProd = products.base({
			id: "free",
			items: [action1Item, creditsItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-deductions-a",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const trackRes: TrackResponseV3 = await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 10,
		});

		expect(trackRes.deductions).toBeDefined();
		expect(trackRes.deductions).toHaveLength(1);

		const action1Deduction = findDeductionByFeature(
			trackRes.deductions,
			TestFeature.Action1,
		);
		expect(action1Deduction).toBeDefined();
		expect(action1Deduction?.value).toBe(10);

		expect(
			findDeductionByFeature(trackRes.deductions, TestFeature.Credits),
		).toBeUndefined();
	},
);

// ═══════════════════════════════════════════════════════════════════
// B: event_name fans out to two features; each within its own
//    allowance → two deductions, no credit-system deductions.
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("track-deductions-B: event_name across two features surfaces a deduction per touched balance")}`,
	async () => {
		const action1Item = items.free({
			featureId: TestFeature.Action1,
			includedUsage: 80,
		});
		const creditsItem = items.free({
			featureId: TestFeature.Credits,
			includedUsage: 150,
		});
		const action3Item = items.free({
			featureId: TestFeature.Action3,
			includedUsage: 60,
		});
		const credits2Item = items.free({
			featureId: TestFeature.Credits2,
			includedUsage: 100,
		});
		const freeProd = products.base({
			id: "free",
			items: [action1Item, creditsItem, action3Item, credits2Item],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-deductions-b",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const trackRes: TrackResponseV3 = await autumnV2_2.track({
			customer_id: customerId,
			event_name: "action-event",
			value: 5,
		});

		expect(trackRes.deductions).toBeDefined();
		expect(trackRes.deductions).toHaveLength(2);

		const featureIds = (trackRes.deductions ?? [])
			.map((deduction) => deduction.feature_id)
			.sort();
		expect(featureIds).toEqual(
			[TestFeature.Action1, TestFeature.Action3].sort(),
		);
		expect(
			findDeductionByFeature(trackRes.deductions, TestFeature.Action1)?.value,
		).toBe(5);
		expect(
			findDeductionByFeature(trackRes.deductions, TestFeature.Action3)?.value,
		).toBe(5);
	},
);

// ═══════════════════════════════════════════════════════════════════
// C: Single-feature track, no credit system.
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("track-deductions-C: feature with no credit systems surfaces a single deduction")}`,
	async () => {
		const messagesItem = items.free({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		});
		const freeProd = products.base({
			id: "free",
			items: [messagesItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-deductions-c",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const trackRes: TrackResponseV3 = await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 7,
		});

		expect(trackRes.deductions).toBeDefined();
		expect(trackRes.deductions).toHaveLength(1);
		expect(trackRes.deductions?.[0].feature_id).toBe(TestFeature.Messages);
		expect(trackRes.deductions?.[0].value).toBe(7);
	},
);

// ═══════════════════════════════════════════════════════════════════
// D: A negative-value track emits a deduction with a negative value
//    (refund / restore).
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("track-deductions-D: negative track value yields a negative-value deduction")}`,
	async () => {
		const messagesItem = items.free({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		});
		const freeProd = products.base({
			id: "free",
			items: [messagesItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-deductions-d",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [
				s.attach({ productId: freeProd.id }),
				s.track({ featureId: TestFeature.Messages, value: 10 }),
			],
		});

		const refundRes: TrackResponseV3 = await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -4,
		});

		expect(refundRes.deductions).toBeDefined();
		expect(refundRes.deductions).toHaveLength(1);
		expect(refundRes.deductions?.[0].feature_id).toBe(TestFeature.Messages);
		expect(refundRes.deductions?.[0].value).toBe(-4);
	},
);

// ═══════════════════════════════════════════════════════════════════
// E: A linked credit-system feature exists in the org but the customer
//    has no entitlement to it — no deduction emitted for that feature.
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("track-deductions-E: missing entitlement on credit system is omitted from deductions")}`,
	async () => {
		const action1Item = items.free({
			featureId: TestFeature.Action1,
			includedUsage: 100,
		});
		const freeProd = products.base({
			id: "free",
			items: [action1Item],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-deductions-e",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const trackRes: TrackResponseV3 = await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		expect(trackRes.deductions).toBeDefined();
		expect(trackRes.deductions).toHaveLength(1);
		expect(trackRes.deductions?.[0].feature_id).toBe(TestFeature.Action1);
		expect(trackRes.deductions?.[0].value).toBe(5);
		expect(
			findDeductionByFeature(trackRes.deductions, TestFeature.Credits),
		).toBeUndefined();
	},
);

// ═══════════════════════════════════════════════════════════════════
// F: Overflow into a linked credit system. This is the load-bearing
//    scenario for the feature — a single track event depletes BOTH
//    the main balance AND the credit-system balance, and the response
//    surfaces both via `deductions`.
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("track-deductions-F: track that overflows the main balance surfaces credit-system deductions too")}`,
	async () => {
		const action1Item = items.free({
			featureId: TestFeature.Action1,
			includedUsage: 100,
		});
		const creditsItem = items.free({
			featureId: TestFeature.Credits,
			includedUsage: 200,
		});
		const freeProd = products.base({
			id: "free",
			items: [action1Item, creditsItem],
		});

		const { customerId, autumnV2_2, autumnV1, ctx } = await initScenario({
			customerId: "track-deductions-f",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const creditFeature = ctx.features.find(
			(f) => f.id === TestFeature.Credits,
		);
		if (!creditFeature) {
			throw new Error(`${TestFeature.Credits} feature not found`);
		}

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerBefore.features[TestFeature.Action1].balance).toBe(100);
		expect(customerBefore.features[TestFeature.Credits].balance).toBe(200);

		// Drain Action1 down to 0 with a first track so the next event
		// has to spill into Credits.
		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 100,
		});

		const overflowAmount = 50;
		const expectedCreditCost = await getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature,
			amount: overflowAmount,
		});

		const trackRes: TrackResponseV3 = await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: overflowAmount,
		});

		expect(trackRes.deductions).toBeDefined();
		expect(trackRes.deductions).toHaveLength(1);

		// Action1 is empty before the overflow event, so the whole 50
		// flows through the credit system and `deductions` has exactly
		// the Credits row.
		const creditsDeduction = findDeductionByFeature(
			trackRes.deductions,
			TestFeature.Credits,
		);
		expect(creditsDeduction).toBeDefined();
		expect(
			new Decimal(creditsDeduction?.value ?? 0)
				.minus(expectedCreditCost)
				.abs()
				.lessThan(1e-9),
		).toBe(true);
	},
);

// ═══════════════════════════════════════════════════════════════════
// G: End-to-end Tinybird round-trip. Track an event, wait for the
//    batch flush + Tinybird ingest, then read it back via events.list
//    and confirm the `deductions` field round-trips through the column.
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("track-deductions-G: deductions round-trip via events.list (writes Tinybird, reads it back)")}`,
	async () => {
		const messagesItem = items.free({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		});
		const freeProd = products.base({
			id: "free",
			items: [messagesItem],
		});

		const { customerId, autumnV1, autumnV2_2 } = await initScenario({
			customerId: "track-deductions-g",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 12,
		});

		// Wait for the EventBatchingManager flush (350ms window) plus Tinybird
		// ingest propagation. Existing credit-system tests use ~2s for cache
		// sync; ~3s gives Tinybird a bit more slack.
		await timeout(3000);

		const eventsList = (await autumnV1.events.list({
			customer_id: customerId,
		})) as ApiEventsListResponse;

		expect(eventsList.list.length).toBeGreaterThan(0);
		const trackedEvent = eventsList.list.find(
			(event) =>
				event.feature_id === TestFeature.Messages && event.value === 12,
		);
		expect(trackedEvent).toBeDefined();
		expect(trackedEvent?.deductions).toBeDefined();
		expect(trackedEvent?.deductions).not.toBeNull();
		expect(trackedEvent?.deductions).toHaveLength(1);
		const deduction = trackedEvent?.deductions?.[0];
		expect(deduction?.feature_id).toBe(TestFeature.Messages);
		expect(deduction?.value).toBe(12);
		// plan_id traces back to the customer entitlement's product. The test
		// framework namespaces product IDs per-customer (e.g. `free_<customerId>`),
		// so we assert the prefix rather than a bare "free" string.
		expect(deduction?.plan_id).toBe(`free_${customerId}`);
		// `reset` carries the entitlement interval. items.free() ships month-based
		// entitlements, so the round-tripped reset should reflect that.
		expect(deduction?.reset).not.toBeNull();
		expect(deduction?.reset?.interval).toBe(ResetInterval.Month);
	},
);

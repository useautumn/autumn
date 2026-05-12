import { expect, test } from "bun:test";

import type {
	ApiCustomerV3,
	TrackMutation,
	TrackResponseV3,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";

const findMutationByFeature = (
	mutations: TrackMutation[] | undefined,
	featureId: string,
): TrackMutation | undefined =>
	mutations?.find((mutation) => mutation.feature_id === featureId);

// ═══════════════════════════════════════════════════════════════════
// A: Track within a feature's own allowance — only the main balance
//    is touched. Linked credit systems serve as overflow only and
//    stay untouched while allowance remains.
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("track-mutations-A: within-allowance track surfaces a single mutation against the main balance")}`,
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
			customerId: "track-mutations-a",
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

		expect(trackRes.mutations).toBeDefined();
		expect(trackRes.mutations).toHaveLength(1);

		const action1Mutation = findMutationByFeature(
			trackRes.mutations,
			TestFeature.Action1,
		);
		expect(action1Mutation).toBeDefined();
		expect(action1Mutation?.value).toBe(10);

		expect(
			findMutationByFeature(trackRes.mutations, TestFeature.Credits),
		).toBeUndefined();
	},
);

// ═══════════════════════════════════════════════════════════════════
// B: event_name fans out to two features; each within its own
//    allowance → two mutations, no credit-system mutations.
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("track-mutations-B: event_name across two features surfaces a mutation per touched balance")}`,
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
			customerId: "track-mutations-b",
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

		expect(trackRes.mutations).toBeDefined();
		expect(trackRes.mutations).toHaveLength(2);

		const featureIds = (trackRes.mutations ?? [])
			.map((mutation) => mutation.feature_id)
			.sort();
		expect(featureIds).toEqual(
			[TestFeature.Action1, TestFeature.Action3].sort(),
		);
		expect(
			findMutationByFeature(trackRes.mutations, TestFeature.Action1)?.value,
		).toBe(5);
		expect(
			findMutationByFeature(trackRes.mutations, TestFeature.Action3)?.value,
		).toBe(5);
	},
);

// ═══════════════════════════════════════════════════════════════════
// C: Single-feature track, no credit system.
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("track-mutations-C: feature with no credit systems surfaces a single mutation")}`,
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
			customerId: "track-mutations-c",
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

		expect(trackRes.mutations).toBeDefined();
		expect(trackRes.mutations).toHaveLength(1);
		expect(trackRes.mutations?.[0].feature_id).toBe(TestFeature.Messages);
		expect(trackRes.mutations?.[0].value).toBe(7);
	},
);

// ═══════════════════════════════════════════════════════════════════
// D: A negative-value track emits a mutation with a negative value
//    (refund / restore).
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("track-mutations-D: negative track value yields a negative-value mutation")}`,
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
			customerId: "track-mutations-d",
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

		expect(refundRes.mutations).toBeDefined();
		expect(refundRes.mutations).toHaveLength(1);
		expect(refundRes.mutations?.[0].feature_id).toBe(TestFeature.Messages);
		expect(refundRes.mutations?.[0].value).toBe(-4);
	},
);

// ═══════════════════════════════════════════════════════════════════
// E: A linked credit-system feature exists in the org but the customer
//    has no entitlement to it — no mutation emitted for that feature.
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("track-mutations-E: missing entitlement on credit system is omitted from mutations")}`,
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
			customerId: "track-mutations-e",
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

		expect(trackRes.mutations).toBeDefined();
		expect(trackRes.mutations).toHaveLength(1);
		expect(trackRes.mutations?.[0].feature_id).toBe(TestFeature.Action1);
		expect(trackRes.mutations?.[0].value).toBe(5);
		expect(
			findMutationByFeature(trackRes.mutations, TestFeature.Credits),
		).toBeUndefined();
	},
);

// ═══════════════════════════════════════════════════════════════════
// F: Overflow into a linked credit system. This is the load-bearing
//    scenario for the feature — a single track event depletes BOTH
//    the main balance AND the credit-system balance, and the response
//    surfaces both via `mutations`.
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("track-mutations-F: track that overflows the main balance surfaces credit-system mutations too")}`,
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
			customerId: "track-mutations-f",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const creditFeature = ctx.features.find(
			(f) => f.id === TestFeature.Credits,
		);
		expect(creditFeature).toBeDefined();

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
		const expectedCreditCost = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: overflowAmount,
		});

		const trackRes: TrackResponseV3 = await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: overflowAmount,
		});

		expect(trackRes.mutations).toBeDefined();
		expect(trackRes.mutations).toHaveLength(1);

		// Action1 is empty before the overflow event, so the whole 50
		// flows through the credit system and `mutations` has exactly
		// the Credits row.
		const creditsMutation = findMutationByFeature(
			trackRes.mutations,
			TestFeature.Credits,
		);
		expect(creditsMutation).toBeDefined();
		expect(
			new Decimal(creditsMutation?.value ?? 0)
				.minus(expectedCreditCost)
				.abs()
				.lessThan(1e-9),
		).toBe(true);
	},
);

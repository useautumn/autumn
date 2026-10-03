/**
 * A run of tracks decides on a deduction context carried from state to state while every write is a
 * balance-only increment, and decides effects only when a draw could have called for one. Both are pure
 * speed-ups: a processor with them answers every command exactly as one without them.
 */

import { describe, expect, test } from "bun:test";
import type { SubjectState, TrackCommand } from "@autumn/balance-engine";
import { createSubjectState } from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	testOccurredAt,
} from "../../fixtures/mutations.js";
import {
	createResidentProcessor,
	residentIdentityOf,
} from "../../fixtures/residentProcessor.js";

const identity = residentIdentityOf({ customerId: "cus_1" });

/** Two features on low balances, so draws cross zero, get refused, and refunds lift them back. */
const lowBalanceState = (): SubjectState =>
	createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [
			createCustomerEntitlement({
				id: "messages_row",
				featureId: "messages",
				balance: 7,
			}),
			createCustomerEntitlement({
				id: "words_row",
				featureId: "words",
				balance: 5,
			}),
			{
				...createCustomerEntitlement({
					id: "words_overage_row",
					featureId: "words",
					balance: 2,
				}),
				usage_allowed: true,
			},
		],
	});

const seededRandom = (seed: number) => {
	let value = seed;
	return () => {
		value = (value + 0x6d2b79f5) | 0;
		let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
	};
};

const randomTracks = ({
	seed,
	count,
}: {
	seed: number;
	count: number;
}): TrackCommand[] => {
	const random = seededRandom(seed);
	const pick = <Value>(values: Value[]): Value =>
		values[Math.floor(random() * values.length)] as Value;
	let occurredAt = testOccurredAt;
	return Array.from({ length: count }, (_, index) => {
		occurredAt += Math.floor(random() * 400);
		return createTrackCommand({
			identity,
			commandId: `trk_${seed}_${index}`,
			featureId: pick(["messages", "words"]),
			value: pick([-1, 1, 1, 2, 3]),
			overageBehavior: pick(["reject", "cap", "overflow"]),
			occurredAt,
		});
	});
};

/** Every reply in order: result, changes, effects and the state's revision and balances as the reply carries them. */
const replay = async ({
	commands,
	carriesTrackContexts,
}: {
	commands: TrackCommand[];
	carriesTrackContexts: boolean;
}) => {
	const processor = await createResidentProcessor({
		states: [lowBalanceState()],
		config: { carriesTrackContexts },
	});
	const replies: TrackReply[] = [];
	for (const command of commands)
		replies.push(await processor.track({ command }));
	return { replies, counters: processor.readCounters() };
};

describe("tracks on a carried context", () => {
	for (const seed of [1, 2, 3, 4, 5])
		test(`answers every track as a processor without it does (seed ${seed})`, async () => {
			const commands = randomTracks({ seed, count: 160 });
			const carried = await replay({ commands, carriesTrackContexts: true });
			const fresh = await replay({ commands, carriesTrackContexts: false });

			expect(carried.replies).toEqual(fresh.replies);
			expect(
				fresh.replies.some((reply) => (reply.effects ?? []).length > 0),
			).toBeTrue();
			expect(carried.counters.trackContextHits).toBeGreaterThan(100);
			expect(carried.counters.effectsSkipped).toBeGreaterThan(0);
			expect(fresh.counters.trackContextHits).toBe(0);
		});
});

/**
 * A run of tracks decides on a deduction context carried from state to state while every write is a
 * balance-only increment, and decides effects only when a draw could have called for one. Both are pure
 * speed-ups: a processor with them answers every command exactly as one without them.
 */

import { describe, expect, test } from "bun:test";
import type { SubjectState, TrackCommand } from "@autumn/balance-engine";
import { createSubjectState } from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import { ResetInterval } from "@autumn/shared";
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
const lowBalanceState = ({
	usageLimits = null,
}: {
	usageLimits?: SubjectState["customer"]["usage_limits"];
} = {}): SubjectState =>
	createSubjectState({
		identity,
		customer: {
			internal_id: identity.customerId,
			id: identity.customerId,
			config: null,
			spend_limits: null,
			overage_allowed: null,
			usage_limits: usageLimits,
		},
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
	features = ["messages", "words"],
	withProperties = false,
}: {
	seed: number;
	count: number;
	features?: string[];
	withProperties?: boolean;
}): TrackCommand[] => {
	const random = seededRandom(seed);
	const pick = <Value>(values: Value[]): Value =>
		values[Math.floor(random() * values.length)] as Value;
	let occurredAt = testOccurredAt;
	return Array.from({ length: count }, (_, index) => {
		occurredAt += Math.floor(random() * 400);
		const command = createTrackCommand({
			identity,
			commandId: `trk_${seed}_${index}`,
			featureId: pick(features),
			value: pick([-1, 1, 1, 2, 3]),
			overageBehavior: pick(["reject", "cap", "overflow"]),
			occurredAt,
		});
		return withProperties
			? { ...command, properties: { model: pick(["fast", "slow"]) } }
			: command;
	});
};

/** Every reply in order: result, changes, effects and the state's revision and balances as the reply carries them. */
const replay = async ({
	commands,
	carriesTrackContexts,
	state = lowBalanceState(),
}: {
	commands: TrackCommand[];
	carriesTrackContexts: boolean;
	state?: SubjectState;
}) => {
	const processor = await createResidentProcessor({
		states: [state],
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

	test("tracks carrying properties carry their context when no rate or cap reads them", async () => {
		const commands = randomTracks({
			seed: 7,
			count: 160,
			withProperties: true,
		});
		const carried = await replay({ commands, carriesTrackContexts: true });
		const fresh = await replay({ commands, carriesTrackContexts: false });

		expect(carried.replies).toEqual(fresh.replies);
		expect(carried.counters.trackContextHits).toBeGreaterThan(100);
	});

	test("a cap filtered on properties keeps property-carrying tracks on a fresh context", async () => {
		const state = lowBalanceState({
			usageLimits: [
				{
					feature_id: "messages",
					enabled: true,
					limit: 3,
					interval: ResetInterval.Day,
					filter: { properties: { model: "slow" } },
				},
			],
		});
		const commands = randomTracks({
			seed: 8,
			count: 80,
			features: ["messages"],
			withProperties: true,
		});
		const carried = await replay({
			commands,
			carriesTrackContexts: true,
			state,
		});
		const fresh = await replay({
			commands,
			carriesTrackContexts: false,
			state,
		});

		expect(carried.replies).toEqual(fresh.replies);
		expect(
			fresh.replies.some((reply) => reply.result.status !== "applied"),
		).toBeTrue();
		expect(carried.counters.trackContextHits).toBe(0);
	});
});

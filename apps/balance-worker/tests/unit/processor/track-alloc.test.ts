/**
 * track-alloc B builds integer draws, usage fields, dry-row checks and context advances in plain numbers.
 * It must log, store and answer exactly what A does: every record and reply byte-identical, across integer and
 * fractional values, refunds, every overage behaviour, rows running dry and rows allowed into overage.
 */

import { describe, expect, test } from "bun:test";
import type { StagingArm } from "@autumn/edge-config";
import { type MeteringRecord, serializeMeteringRecord } from "@autumn/kafka";
import { TRACK_ALLOC_EXPERIMENT } from "../../../src/experiments/trackAlloc.js";
import { serializeSubjectReply } from "../../../src/http/replies/serializeSubjectReply.js";
import { createBenchProcessor } from "../../benchmarks/track-throughput/createBenchProcessor.js";
import {
	type Scenario,
	scenarios,
} from "../../benchmarks/track-throughput/scenarios.js";
import {
	createInitializeRequest,
	createTrackCommand,
	testIdentity,
} from "../../fixtures/mutations.js";
import {
	clearStagingArms,
	forceStagingArm,
} from "../../fixtures/stagingArms.js";

const randomOf = (seed: number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
};

/** The scenario's rows with small balances, some allowed into overage, so draws run dry and fall short. */
const nearLimit = ({
	scenario,
	seed,
}: {
	scenario: Scenario;
	seed: number;
}): Scenario => {
	return {
		...scenario,
		stateFor: ({ identity }) => {
			const random = randomOf(seed);
			const state = scenario.stateFor({ identity });
			return {
				...state,
				customerEntitlements: state.customerEntitlements.map((row) => ({
					...row,
					balance: Math.floor(random() * 30) - 3,
					usage_allowed: random() < 0.3,
				})),
			};
		},
	};
};

const trackValueOf = (random: () => number): number => {
	const roll = random();
	if (roll < 0.6) return 1 + Math.floor(random() * 8);
	if (roll < 0.7) return -(1 + Math.floor(random() * 5));
	if (roll < 0.8) return Math.round(random() * 400) / 100;
	if (roll < 0.9) return 25 + Math.floor(random() * 50);
	return 0;
};

const BEHAVIORS = ["reject", "cap", "overflow"] as const;

async function runArm({
	arm,
	scenario,
	seed,
}: {
	arm: StagingArm;
	scenario: Scenario;
	seed: number;
}) {
	forceStagingArm({ experiment: TRACK_ALLOC_EXPERIMENT, arm });
	const records: string[] = [];
	const bench = await createBenchProcessor({
		scenario,
		partition: 0,
		latency: { appendMs: 0, applyMs: 0 },
		serialize: false,
		instrument: (ports) => ({
			...ports,
			appender: {
				...ports.appender,
				appendCommitted: (params) => {
					for (const record of params.outcomes as readonly MeteringRecord[])
						records.push(
							// The receipt's expiry is stamped from the wall clock, so two runs differ there alone.
							serializeMeteringRecord({ record })
								.value.toString()
								.replace(/"expiresAt":\d+/g, '"expiresAt":0'),
						);
					return ports.appender.appendCommitted(params);
				},
			},
		}),
	});
	const identity = { ...testIdentity, customerId: "cus_eq" };
	await bench.processor.initialize({
		request: createInitializeRequest({
			state: scenario.stateFor({ identity }),
			commandId: "init",
			requestId: "req_init",
		}),
	});
	const random = randomOf(seed);
	const replies: string[] = [];
	for (let index = 0; index < 300; index++) {
		const command = createTrackCommand({
			identity,
			commandId: `t_${index}`,
			featureId:
				scenario.features[Math.floor(random() * scenario.features.length)],
			value: trackValueOf(random),
			overageBehavior: BEHAVIORS[Math.floor(random() * 3)],
			occurredAt: 1_700_000_000_000 + index * 7,
		});
		try {
			replies.push(
				serializeSubjectReply({
					reply: await bench.processor.track({ command }),
				}),
			);
		} catch (cause) {
			replies.push(
				`error:${(cause as Error).name}:${(cause as Error).message}`,
			);
		}
	}
	await bench.processor.drain();
	return { replies, records };
}

describe("track-alloc B is byte-identical to A", () => {
	const cases = [
		{ name: "typical, roomy", scenario: scenarios.typical },
		{ name: "heavy, roomy", scenario: scenarios.heavy },
		...[1, 2, 3, 4].map((seed) => ({
			name: `typical near the limit (seed ${seed})`,
			scenario:
				scenarios.typical && nearLimit({ scenario: scenarios.typical, seed }),
		})),
		...[5, 6].map((seed) => ({
			name: `heavy near the limit (seed ${seed})`,
			scenario:
				scenarios.heavy && nearLimit({ scenario: scenarios.heavy, seed }),
		})),
	];
	for (const { name, scenario } of cases) {
		test(name, async () => {
			if (!scenario) throw new Error("scenario");
			try {
				const a = await runArm({ arm: "A", scenario, seed: 42 });
				const b = await runArm({ arm: "B", scenario, seed: 42 });
				expect(a.replies.length).toBe(300);
				expect(b.replies).toEqual(a.replies);
				expect(b.records).toEqual(a.records);
				// The cases cover what B changes and what it hands back to A's path.
				const joined = a.replies.join("\n");
				expect(joined).toContain('"status":"applied"');
			} finally {
				clearStagingArms();
			}
		});
	}
});

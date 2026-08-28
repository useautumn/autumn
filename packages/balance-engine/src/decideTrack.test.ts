import { describe, expect, test } from "bun:test";
import {
	applyTrackOutcome,
	createMeteringState,
	decideTrack,
	meteringPartitionKeyOf,
	OutOfOrderTrackOutcomeError,
	parseTrackCommand,
	shadowComparisonKeyOf,
} from "./balanceEngine.js";

/**
 * Contract: versioned commands produce deterministic outcomes; only durable
 * outcomes advance customer state; retries return the stored result; inputs
 * outside the first direct-meter slice are named and left untouched.
 */

const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
} as const;

const createState = ({ balance = 10 }: { balance?: number } = {}) =>
	createMeteringState({
		identity,
		features: {
			messages: {
				kind: "metered",
				buckets: [{ id: "messages_monthly", balance, usage: 0 }],
			},
		},
	});

const createCommand = ({
	commandId = "cmd_1",
	requestId = "req_1",
	value = 5,
	overageBehavior = "reject",
	entityId = null,
}: {
	commandId?: string;
	requestId?: string;
	value?: number;
	overageBehavior?: "cap" | "reject" | "overflow";
	entityId?: string | null;
} = {}) =>
	parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId,
			requestId,
			identity,
			entityId,
			featureId: "messages",
			value,
			overageBehavior,
			properties: null,
			occurredAt: 1_700_000_000_000,
		},
	});

const requireNewOutcome = (decision: ReturnType<typeof decideTrack>) => {
	if (decision.kind !== "new") {
		throw new Error(`Expected a new outcome, received ${decision.kind}`);
	}
	return decision.outcome;
};

describe("track decisions", () => {
	test.concurrent(
		"builds customer ordering and exact shadow comparison keys",
		() => {
			const command = createCommand();

			expect(meteringPartitionKeyOf({ identity })).toBe(
				'["org_1","sandbox","cus_1"]',
			);
			expect(shadowComparisonKeyOf({ command })).toBe(
				'["org_1","sandbox","cus_1","messages","cmd_1"]',
			);
		},
	);

	test.concurrent("decides once, then applies the durable outcome", () => {
		const state = createState();
		const outcome = requireNewOutcome(
			decideTrack({ state, command: createCommand() }),
		);

		expect(outcome).toMatchObject({
			status: "applied",
			reason: null,
			requestedValue: 5,
			appliedValue: 5,
			balanceBefore: 10,
			balanceAfter: 5,
			revisionBefore: 0,
			revisionAfter: 1,
		});
		expect(state.features.messages.buckets[0]).toEqual({
			id: "messages_monthly",
			balance: 10,
			usage: 0,
		});

		const applied = applyTrackOutcome({ state, outcome });

		expect(applied.kind).toBe("applied");
		expect(applied.state.features.messages.buckets[0]).toEqual({
			id: "messages_monthly",
			balance: 5,
			usage: 5,
		});
		expect(applied.state.receipts.cmd_1).toEqual(outcome);
	});

	test.concurrent(
		"serializes concurrent commands against the state produced before them",
		() => {
			let state = createState();
			const statuses: string[] = [];

			for (const [index, commandId] of ["cmd_1", "cmd_2", "cmd_3"].entries()) {
				const outcome = requireNewOutcome(
					decideTrack({
						state,
						command: createCommand({
							commandId,
							requestId: `req_${index + 1}`,
						}),
					}),
				);
				statuses.push(outcome.status);
				state = applyTrackOutcome({ state, outcome }).state;
			}

			expect(statuses).toEqual(["applied", "applied", "rejected"]);
			expect(state.features.messages.buckets[0]).toMatchObject({
				balance: 0,
				usage: 10,
			});
			expect(state.revision).toBe(3);
			expect(Object.keys(state.receipts)).toHaveLength(3);
		},
	);

	test.concurrent("caps at the available balance", () => {
		const outcome = requireNewOutcome(
			decideTrack({
				state: createState({ balance: 3 }),
				command: createCommand({ value: 5, overageBehavior: "cap" }),
			}),
		);

		expect(outcome).toMatchObject({
			status: "applied",
			requestedValue: 5,
			appliedValue: 3,
			balanceAfter: 0,
		});
	});

	test.concurrent(
		"rejects without moving balances and persists the terminal receipt",
		() => {
			const state = createState({ balance: 3 });
			const outcome = requireNewOutcome(
				decideTrack({ state, command: createCommand({ value: 5 }) }),
			);

			expect(outcome).toMatchObject({
				status: "rejected",
				reason: "insufficient_balance",
				appliedValue: 0,
				balanceBefore: 3,
				balanceAfter: 3,
				mutations: [],
			});

			const applied = applyTrackOutcome({ state, outcome });
			expect(applied.state.features).toEqual(state.features);
			expect(applied.state.receipts.cmd_1).toEqual(outcome);
		},
	);

	test.concurrent("overflow applies the full value", () => {
		const state = createState({ balance: 3 });
		const outcome = requireNewOutcome(
			decideTrack({
				state,
				command: createCommand({ value: 5, overageBehavior: "overflow" }),
			}),
		);
		const applied = applyTrackOutcome({ state, outcome });

		expect(outcome.appliedValue).toBe(5);
		expect(applied.state.features.messages.buckets[0]).toMatchObject({
			balance: -2,
			usage: 5,
		});
	});

	test.concurrent("returns the stored outcome for a duplicate command", () => {
		const command = createCommand();
		const initialState = createState();
		const outcome = requireNewOutcome(
			decideTrack({ state: initialState, command }),
		);
		const state = applyTrackOutcome({ state: initialState, outcome }).state;

		const duplicate = decideTrack({ state, command });

		expect(duplicate).toEqual({ kind: "duplicate", outcome });
		expect(applyTrackOutcome({ state, outcome })).toEqual({
			kind: "duplicate",
			state,
		});
	});

	test.concurrent("rejects a reused command id with different input", () => {
		const initialState = createState();
		const outcome = requireNewOutcome(
			decideTrack({ state: initialState, command: createCommand() }),
		);
		const state = applyTrackOutcome({ state: initialState, outcome }).state;

		expect(
			decideTrack({ state, command: createCommand({ value: 4 }) }),
		).toEqual({
			kind: "unsupported",
			reason: "command_conflict",
		});
	});

	test.concurrent(
		"names inputs that are outside the first supported path",
		() => {
			const entityDecision = decideTrack({
				state: createState(),
				command: createCommand({ entityId: "entity_1" }),
			});
			const refundDecision = decideTrack({
				state: createState(),
				command: createCommand({ value: -1 }),
			});
			const missingFeatureDecision = decideTrack({
				state: createMeteringState({ identity, features: {} }),
				command: createCommand(),
			});
			const multipleBucketDecision = decideTrack({
				state: createMeteringState({
					identity,
					features: {
						messages: {
							kind: "metered",
							buckets: [
								{ id: "messages_monthly", balance: 5, usage: 0 },
								{ id: "messages_rollover", balance: 5, usage: 0 },
							],
						},
					},
				}),
				command: createCommand(),
			});

			expect(entityDecision).toEqual({
				kind: "unsupported",
				reason: "entity_not_supported",
			});
			expect(refundDecision).toEqual({
				kind: "unsupported",
				reason: "refund_not_supported",
			});
			expect(missingFeatureDecision).toEqual({
				kind: "unsupported",
				reason: "feature_not_found",
			});
			expect(multipleBucketDecision).toEqual({
				kind: "unsupported",
				reason: "multiple_buckets_not_supported",
			});
		},
	);

	test.concurrent(
		"rejects an outcome decided against an older revision",
		() => {
			const state = createState();
			const firstOutcome = requireNewOutcome(
				decideTrack({ state, command: createCommand() }),
			);
			const secondOutcome = requireNewOutcome(
				decideTrack({
					state,
					command: createCommand({ commandId: "cmd_2", requestId: "req_2" }),
				}),
			);
			const advancedState = applyTrackOutcome({
				state,
				outcome: firstOutcome,
			}).state;

			expect(() =>
				applyTrackOutcome({ state: advancedState, outcome: secondOutcome }),
			).toThrow(OutOfOrderTrackOutcomeError);
		},
	);

	test.concurrent("rejects an outcome whose expected balance is stale", () => {
		const outcome = requireNewOutcome(
			decideTrack({ state: createState(), command: createCommand() }),
		);

		expect(() =>
			applyTrackOutcome({ state: createState({ balance: 9 }), outcome }),
		).toThrow("Outcome does not match current bucket messages");
	});

	test.concurrent("validates the versioned command envelope", () => {
		expect(() =>
			parseTrackCommand({
				input: { ...createCommand(), schemaVersion: 2 },
			}),
		).toThrow();
		expect(() =>
			parseTrackCommand({ input: { ...createCommand(), value: 0 } }),
		).toThrow();
	});
});

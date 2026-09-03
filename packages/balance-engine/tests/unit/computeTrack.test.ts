import { describe, expect, test } from "bun:test";
import {
	computeTrack,
	createCustomerMeteringState,
	executeTrack,
	meteringPartitionKeyOf,
	OutOfOrderTrackOutcomeError,
	parseTrackCommand,
	shadowComparisonKeyOf,
} from "../../src/balanceEngine.js";

const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
} as const;

const createState = ({ balance = 10 }: { balance?: number } = {}) =>
	createCustomerMeteringState({
		identity,
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [{ id: "messages_monthly", balance, usage: 0 }],
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
			deduplicationExpiresAt: 1_700_086_400_000,
		},
	});

const requireNewOutcome = (decision: ReturnType<typeof computeTrack>) => {
	if (decision.kind !== "new") {
		throw new Error(`Expected a new outcome, received ${decision.kind}`);
	}
	return decision.outcome;
};

describe("track computation and execution", () => {
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

	test.concurrent("computes once, then executes the durable outcome", () => {
		const state = createState();
		const outcome = requireNewOutcome(
			computeTrack({ state, command: createCommand() }),
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
			mutations: [{ customerEntitlementId: "messages_monthly" }],
		});
		expect(state.featureStatesById.messages.customerEntitlements[0]).toEqual({
			id: "messages_monthly",
			balance: 10,
			usage: 0,
		});

		const applied = executeTrack({ state, outcome });

		expect(applied.kind).toBe("applied");
		expect(
			applied.state.featureStatesById.messages.customerEntitlements[0],
		).toEqual({
			id: "messages_monthly",
			balance: 5,
			usage: 5,
		});
		expect(applied.receipt).toEqual(outcome);
	});

	test.concurrent(
		"computes queued commands against the previously executed state",
		() => {
			let state = createState();
			const statuses: string[] = [];
			const receipts = [];

			for (const [index, commandId] of ["cmd_1", "cmd_2", "cmd_3"].entries()) {
				const outcome = requireNewOutcome(
					computeTrack({
						state,
						command: createCommand({
							commandId,
							requestId: `req_${index + 1}`,
						}),
					}),
				);
				statuses.push(outcome.status);
				const applied = executeTrack({ state, outcome });
				state = applied.state;
				receipts.push(applied.receipt);
			}

			expect(statuses).toEqual(["applied", "applied", "rejected"]);
			expect(
				state.featureStatesById.messages.customerEntitlements[0],
			).toMatchObject({
				balance: 0,
				usage: 10,
			});
			expect(state.revision).toBe(3);
			expect(receipts).toHaveLength(3);
		},
	);

	test.concurrent("caps at the available balance", () => {
		const outcome = requireNewOutcome(
			computeTrack({
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
				computeTrack({ state, command: createCommand({ value: 5 }) }),
			);

			expect(outcome).toMatchObject({
				status: "rejected",
				reason: "insufficient_balance",
				appliedValue: 0,
				balanceBefore: 3,
				balanceAfter: 3,
				mutations: [],
			});

			const applied = executeTrack({ state, outcome });
			expect(applied.state.featureStatesById).toEqual(state.featureStatesById);
			expect(applied.receipt).toEqual(outcome);
		},
	);

	test.concurrent("overflow applies the full value", () => {
		const state = createState({ balance: 3 });
		const outcome = requireNewOutcome(
			computeTrack({
				state,
				command: createCommand({ value: 5, overageBehavior: "overflow" }),
			}),
		);
		const applied = executeTrack({ state, outcome });

		expect(outcome.appliedValue).toBe(5);
		expect(
			applied.state.featureStatesById.messages.customerEntitlements[0],
		).toMatchObject({
			balance: -2,
			usage: 5,
		});
	});

	test.concurrent("returns the stored outcome for a duplicate command", () => {
		const command = createCommand();
		const initialState = createState();
		const outcome = requireNewOutcome(
			computeTrack({ state: initialState, command }),
		);
		const state = executeTrack({ state: initialState, outcome }).state;

		const duplicate = computeTrack({
			state,
			command,
			existingReceipt: outcome,
		});

		expect(duplicate).toEqual({ kind: "duplicate", outcome });
		expect(executeTrack({ state, outcome, existingReceipt: outcome })).toEqual({
			kind: "duplicate",
			state,
			receipt: outcome,
		});
	});

	test.concurrent("rejects a reused command id with different input", () => {
		const initialState = createState();
		const outcome = requireNewOutcome(
			computeTrack({ state: initialState, command: createCommand() }),
		);
		const state = executeTrack({ state: initialState, outcome }).state;

		expect(
			computeTrack({
				state,
				command: createCommand({ value: 4 }),
				existingReceipt: outcome,
			}),
		).toEqual({
			kind: "unsupported",
			reason: "command_conflict",
		});
	});

	test.concurrent(
		"names inputs that are outside the first supported path",
		() => {
			const entityDecision = computeTrack({
				state: createState(),
				command: createCommand({ entityId: "entity_1" }),
			});
			const refundDecision = computeTrack({
				state: createState(),
				command: createCommand({ value: -1 }),
			});
			const missingFeatureDecision = computeTrack({
				state: createCustomerMeteringState({
					identity,
					featureStatesById: {},
				}),
				command: createCommand(),
			});
			const inheritedFeatureDecision = computeTrack({
				state: createState(),
				command: { ...createCommand(), featureId: "constructor" },
			});
			const multipleCustomerEntitlementDecision = computeTrack({
				state: createCustomerMeteringState({
					identity,
					featureStatesById: {
						messages: {
							kind: "direct_metered_v1",
							customerEntitlements: [
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
			expect(inheritedFeatureDecision).toEqual({
				kind: "unsupported",
				reason: "feature_not_found",
			});
			expect(multipleCustomerEntitlementDecision).toEqual({
				kind: "unsupported",
				reason: "multiple_customer_entitlements_not_supported",
			});
		},
	);

	test.concurrent(
		"rejects an outcome decided against an older revision",
		() => {
			const state = createState();
			const firstOutcome = requireNewOutcome(
				computeTrack({ state, command: createCommand() }),
			);
			const secondOutcome = requireNewOutcome(
				computeTrack({
					state,
					command: createCommand({ commandId: "cmd_2", requestId: "req_2" }),
				}),
			);
			const advancedState = executeTrack({
				state,
				outcome: firstOutcome,
			}).state;

			expect(() =>
				executeTrack({ state: advancedState, outcome: secondOutcome }),
			).toThrow(OutOfOrderTrackOutcomeError);
		},
	);

	test.concurrent("rejects an outcome whose expected balance is stale", () => {
		const outcome = requireNewOutcome(
			computeTrack({ state: createState(), command: createCommand() }),
		);

		expect(() =>
			executeTrack({ state: createState({ balance: 9 }), outcome }),
		).toThrow("Outcome does not match current state for messages");
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

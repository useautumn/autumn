import { expect, test } from "bun:test";
import {
	computeCheck,
	computeTrack,
	executeTrack,
	parseCheckCommand,
	parseCustomerMeteringState,
	parseTrackCommand,
	parseTrackOutcome,
	StaleTrackOutcomeError,
} from "../../src/balanceEngine.js";

const identity = { orgId: "org", env: "sandbox", customerId: "customer" };
const metadata = {
	externalId: "messages-grant",
	granted: 100,
	planId: "pro",
	reset: {
		interval: "month",
		intervalCount: 1,
		nextResetAt: 1_800_000_000_000,
	},
	expiresAt: null,
} as const;
const createState = ({ balance = 10, usage = 2 } = {}) =>
	parseCustomerMeteringState({
		input: {
			schemaVersion: 1,
			identity,
			revision: 0,
			featureStatesById: {
				messages: {
					kind: "direct_metered_v1",
					customerEntitlements: [{ id: "grant", balance, usage, ...metadata }],
				},
			},
		},
	});
const createCommand = ({ commandId = "track", value = 5, cap = false } = {}) =>
	parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId,
			requestId: commandId,
			identity,
			entityId: null,
			featureId: "messages",
			value,
			overageBehavior: cap ? "cap" : "reject",
			properties: null,
			occurredAt: 1_700_000_000_000,
		},
	});

test.concurrent(
	"check returns balance metadata from the same state revision",
	() => {
		const state = createState();
		const result = computeCheck({
			state,
			command: parseCheckCommand({
				input: {
					schemaVersion: 1,
					type: "check",
					requestId: "check",
					identity,
					entityId: null,
					featureId: "messages",
					requiredBalance: 5,
					properties: null,
					occurredAt: 1_700_000_000_000,
				},
			}),
		});

		expect(result).toMatchObject({
			kind: "decided",
			allowed: true,
			balance: 10,
			revision: 0,
			balanceSnapshot: { id: "grant", balance: 10, usage: 2, ...metadata },
		});
		expect(state).toEqual(createState());
	},
);

test.concurrent(
	"track receipts preserve their original balance snapshot after later usage",
	() => {
		const state = createState();
		const decision = computeTrack({
			state,
			command: createCommand(),
			deduplicationExpiresAt: 1_700_086_400_000,
		});
		if (decision.kind !== "new") throw new Error("Expected a new outcome");
		const applied = executeTrack({ state, outcome: decision.outcome });
		const laterDecision = computeTrack({
			state: applied.state,
			command: createCommand({ commandId: "later", value: 1 }),
			deduplicationExpiresAt: 1_700_086_400_000,
		});
		if (laterDecision.kind !== "new") throw new Error("Expected a new outcome");
		const later = executeTrack({
			state: applied.state,
			outcome: laterDecision.outcome,
		});
		const duplicate = executeTrack({
			state: later.state,
			outcome: decision.outcome,
			existingReceipt: applied.receipt,
		});

		expect(duplicate).toMatchObject({
			kind: "duplicate",
			receipt: {
				balanceSnapshot: { id: "grant", balance: 5, usage: 7, ...metadata },
			},
		});
		expect(
			duplicate.state.featureStatesById.messages.customerEntitlements,
		).toEqual([{ id: "grant", balance: 4, usage: 8, ...metadata }]);
	},
);

test.concurrent(
	"zero-mutation outcomes retain usage and metadata without guessing",
	() => {
		for (const cap of [false, true]) {
			const state = createState({ balance: 0, usage: 13 });
			const decision = computeTrack({
				state,
				command: createCommand({ cap }),
				deduplicationExpiresAt: 1_700_086_400_000,
			});
			if (decision.kind !== "new") throw new Error("Expected a new outcome");

			expect(decision.outcome).toMatchObject({
				status: cap ? "applied" : "rejected",
				mutations: [],
				balanceSnapshot: { id: "grant", balance: 0, usage: 13, ...metadata },
			});
			expect(
				executeTrack({ state, outcome: decision.outcome }).state.revision,
			).toBe(1);
		}
	},
);

test.concurrent(
	"the outcome boundary rejects snapshots that disagree with mutations",
	() => {
		const decision = computeTrack({
			state: createState(),
			command: createCommand(),
			deduplicationExpiresAt: 1_700_086_400_000,
		});
		if (decision.kind !== "new") throw new Error("Expected a new outcome");
		for (const changed of [
			{ balance: 99 },
			{ usage: 99 },
			{ id: "other-grant" },
		]) {
			expect(() =>
				parseTrackOutcome({
					input: {
						...decision.outcome,
						balanceSnapshot: {
							...decision.outcome.balanceSnapshot,
							...changed,
						},
					},
				}),
			).toThrow();
		}
	},
);

test.concurrent(
	"apply refuses snapshots that change metadata or invent zero-mutation usage",
	() => {
		for (const balance of [0, 10]) {
			const state = createState({ balance });
			const decision = computeTrack({
				state,
				command: createCommand({ cap: true }),
				deduplicationExpiresAt: 1_700_086_400_000,
			});
			if (decision.kind !== "new") throw new Error("Expected a new outcome");
			for (const changed of [
				{ granted: 999 },
				{ externalId: "another-public-id" },
				...(balance === 0 ? [{ usage: 999 }] : []),
			]) {
				expect(() =>
					executeTrack({
						state,
						outcome: {
							...decision.outcome,
							balanceSnapshot: {
								...decision.outcome.balanceSnapshot,
								...changed,
							},
						},
					}),
				).toThrow(StaleTrackOutcomeError);
			}
			expect(state).toEqual(createState({ balance }));
		}
	},
);

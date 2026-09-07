import { describe, expect, test } from "bun:test";
import {
	ConflictingTrackReceiptError,
	computeTrack,
	createCustomerMeteringState,
	executeTrack,
	OutOfOrderTrackOutcomeError,
	parseTrackCommand,
	StaleTrackOutcomeError,
} from "../../src/balanceEngine.js";

const createFixture = ({
	value = 3,
	commandId = "cmd_reused",
	customerId = "cus_1",
}: {
	value?: number;
	commandId?: string;
	customerId?: string;
} = {}) => {
	const state = createCustomerMeteringState({
		identity: { orgId: "org_1", env: "sandbox", customerId },
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [
					{
						id: "messages_monthly",
						balance: 10,
						usage: 0,
						granted: 10,
						externalId: null,
						planId: null,
						reset: null,
						expiresAt: null,
					},
				],
			},
		},
	});
	const command = parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId,
			requestId: "req_1",
			identity: state.identity,
			entityId: null,
			featureId: "messages",
			value: 5,
			overageBehavior: "reject",
			properties: null,
			occurredAt: 1_700_000_000_000,
		},
	});
	const first = computeTrack({ state, command, deduplicationExpiresAt: 1 });
	if (first.kind !== "new") throw new Error("Expected a track outcome");
	const applied = executeTrack({ state, outcome: first.outcome });
	const successor = computeTrack({
		state: applied.state,
		command: { ...command, value, requestId: "req_2" },
		deduplicationExpiresAt: 2,
	});
	if (successor.kind !== "new") throw new Error("Expected a successor outcome");
	return {
		state: applied.state,
		receipt: first.outcome,
		outcome: successor.outcome,
	};
};

describe("track receipt replay", () => {
	test.concurrent.each([3, 5, 6])(
		"applies a committed successor requesting %i",
		(value) => {
			const { state, receipt, outcome } = createFixture({ value });
			const expected = executeTrack({ state, outcome });
			const applied = executeTrack({
				state,
				outcome,
				existingReceipt: receipt,
			});
			expect(applied).toEqual(expected);
			expect(applied).toMatchObject({
				kind: "applied",
				state: { revision: 2 },
				receipt: outcome,
			});
			expect(
				executeTrack({
					state: applied.state,
					outcome,
					existingReceipt: applied.receipt,
				}),
			).toEqual({ kind: "duplicate", state: applied.state, receipt: outcome });
		},
	);

	test.concurrent("keeps an identical receipt idempotent", () => {
		const { state, receipt } = createFixture();
		expect(
			executeTrack({ state, outcome: receipt, existingReceipt: receipt }),
		).toEqual({
			kind: "duplicate",
			state,
			receipt,
		});
	});

	test.concurrent(
		"rejects conflicting outcomes from the same execution",
		() => {
			const { state, receipt } = createFixture();
			expect(() =>
				executeTrack({
					state,
					outcome: { ...receipt, requestId: "req_conflict" },
					existingReceipt: receipt,
				}),
			).toThrow(ConflictingTrackReceiptError);
		},
	);

	test.concurrent.each(["command", "customer"] as const)(
		"does not supersede a receipt for another %s",
		(field) => {
			const { state, outcome } = createFixture();
			const foreignReceipt = createFixture(
				field === "command"
					? { commandId: "cmd_other" }
					: { customerId: "cus_other" },
			).receipt;
			expect(() =>
				executeTrack({ state, outcome, existingReceipt: foreignReceipt }),
			).toThrow(ConflictingTrackReceiptError);
		},
	);

	test.concurrent("still rejects a successor with a skipped revision", () => {
		const { state, receipt, outcome } = createFixture();
		expect(() =>
			executeTrack({
				state,
				outcome: { ...outcome, revisionBefore: 2, revisionAfter: 3 },
				existingReceipt: receipt,
			}),
		).toThrow(OutOfOrderTrackOutcomeError);
	});

	test.concurrent(
		"still rejects a successor with stale balance expectations",
		() => {
			const { state, receipt, outcome } = createFixture();
			const staleState = {
				...state,
				featureStatesById: {
					messages: {
						...state.featureStatesById.messages,
						customerEntitlements: [
							{
								id: "messages_monthly",
								balance: 4,
								usage: 6,
								granted: 10,
								externalId: null,
								planId: null,
								reset: null,
								expiresAt: null,
							},
						],
					},
				},
			};
			expect(() =>
				executeTrack({ state: staleState, outcome, existingReceipt: receipt }),
			).toThrow(StaleTrackOutcomeError);
		},
	);
});

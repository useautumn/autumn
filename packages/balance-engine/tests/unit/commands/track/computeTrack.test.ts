import { describe, expect, test } from "bun:test";
import {
	type CustomerStateMutation,
	computeTrack as computeTrackDecision,
	trackCommandFingerprintOf,
	validateTrackMutation,
} from "../../../../src/balanceEngine.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createState,
	createTrackCommand,
	deduplicationExpiresAt,
	identity,
	requireNewMutation,
	trackResultOf,
} from "../../engineFixtures.js";

const computeTrack = (
	input: Omit<
		Parameters<typeof computeTrackDecision>[0],
		"deduplicationExpiresAt" | "catalog"
	>,
) =>
	computeTrackDecision({
		...input,
		catalog: createCatalogFor({ state: input.state }),
		deduplicationExpiresAt,
	});

const trackMutation = (
	input: Omit<
		Parameters<typeof computeTrackDecision>[0],
		"deduplicationExpiresAt" | "catalog"
	>,
) => requireNewMutation(computeTrack(input));

const updateChangesOf = ({ mutation }: { mutation: CustomerStateMutation }) =>
	mutation.changes.map((change) =>
		change.op === "update"
			? { id: change.id, before: change.before, after: change.after }
			: change,
	);

describe("track computation", () => {
	test.concurrent("deducts the requested value from the single row", () => {
		const mutation = trackMutation({
			state: createState({ balance: 100 }),
			command: createTrackCommand({ value: 5, overageBehavior: "cap" }),
		});

		expect(mutation.revision).toEqual({ before: 0, after: 1 });
		expect(updateChangesOf({ mutation })).toEqual([
			{
				id: "messages_monthly",
				before: { balance: 100 },
				after: { balance: 95 },
			},
		]);
		expect(trackResultOf({ mutation })).toMatchObject({
			status: "applied",
			reason: null,
			requestedValue: 5,
			appliedValue: 5,
			balanceBefore: 100,
			balanceAfter: 95,
			customerEntitlement: { id: "messages_monthly", balance: 95 },
		});
	});

	test.concurrent("caps at the available balance", () => {
		const mutation = trackMutation({
			state: createState({ balance: 3 }),
			command: createTrackCommand({ value: 5, overageBehavior: "cap" }),
		});

		expect(updateChangesOf({ mutation })).toEqual([
			{
				id: "messages_monthly",
				before: { balance: 3 },
				after: { balance: 0 },
			},
		]);
		expect(trackResultOf({ mutation })).toMatchObject({
			status: "applied",
			appliedValue: 3,
			balanceAfter: 0,
		});
	});

	test.concurrent("rejects without changing any row", () => {
		const mutation = trackMutation({
			state: createState({ balance: 3 }),
			command: createTrackCommand({ value: 5 }),
		});

		expect(mutation.changes).toEqual([]);
		expect(trackResultOf({ mutation })).toMatchObject({
			status: "rejected",
			reason: "insufficient_balance",
			appliedValue: 0,
			balanceBefore: 3,
			balanceAfter: 3,
			customerEntitlement: { balance: 3 },
		});
	});

	test.concurrent("overflows the row past zero", () => {
		const mutation = trackMutation({
			state: createState({ balance: 3 }),
			command: createTrackCommand({ value: 5, overageBehavior: "overflow" }),
		});

		expect(updateChangesOf({ mutation })).toEqual([
			{
				id: "messages_monthly",
				before: { balance: 3 },
				after: { balance: -2 },
			},
		]);
		expect(trackResultOf({ mutation })).toMatchObject({
			status: "applied",
			appliedValue: 5,
			balanceAfter: -2,
		});
	});

	test.concurrent("names every input outside the supported path", () => {
		const otherCustomerState = createState();
		const commandForOtherCustomer = {
			...createTrackCommand(),
			identity: { ...identity, customerId: "cus_2" },
		};

		expect(
			computeTrack({
				state: otherCustomerState,
				command: commandForOtherCustomer,
			}),
		).toEqual({ kind: "unsupported", reason: "subject_mismatch" });
		expect(
			computeTrack({
				state: createState(),
				command: createTrackCommand({ entityId: "entity_1" }),
			}),
		).toEqual({ kind: "unsupported", reason: "entity_not_supported" });
		expect(
			computeTrack({
				state: createState(),
				command: createTrackCommand({ properties: { region: "eu" } }),
			}),
		).toEqual({ kind: "unsupported", reason: "properties_not_supported" });
		expect(
			computeTrack({
				state: createState(),
				command: createTrackCommand({ value: -1 }),
			}),
		).toEqual({ kind: "unsupported", reason: "refund_not_supported" });
		expect(
			computeTrack({
				state: createState({ customerEntitlements: [] }),
				command: createTrackCommand(),
			}),
		).toEqual({ kind: "unsupported", reason: "feature_not_found" });
		expect(
			computeTrack({
				state: createState(),
				command: createTrackCommand({ featureId: "constructor" }),
			}),
		).toEqual({ kind: "unsupported", reason: "feature_not_found" });
		expect(
			computeTrackDecision({
				state: createState(),
				catalog: createCatalogFor({
					state: createState({ customerEntitlements: [] }),
				}),
				command: createTrackCommand(),
				deduplicationExpiresAt,
			}),
		).toEqual({ kind: "unsupported", reason: "feature_not_found" });
		expect(
			computeTrack({
				state: createState({
					customerEntitlements: [
						createCustomerEntitlement({ id: "messages_monthly", balance: 5 }),
						createCustomerEntitlement({ id: "messages_rollover", balance: 5 }),
					],
				}),
				command: createTrackCommand(),
			}),
		).toEqual({
			kind: "unsupported",
			reason: "multiple_customer_entitlements_not_supported",
		});
	});

	test.concurrent("fingerprints the command a writer can dedup on", () => {
		const command = createTrackCommand();
		const mutation = trackMutation({ state: createState(), command });
		const retriedCommand = createTrackCommand({
			commandId: command.commandId,
			requestId: "req_retry",
		});

		expect(mutation.receipt).toEqual({
			fingerprint: trackCommandFingerprintOf({ command }),
			expiresAt: deduplicationExpiresAt,
		});
		expect(
			trackMutation({ state: createState(), command: retriedCommand }).receipt
				.fingerprint,
		).toBe(mutation.receipt.fingerprint);
		expect(
			trackCommandFingerprintOf({
				command: createTrackCommand({ value: 6 }),
			}),
		).not.toBe(mutation.receipt.fingerprint);
	});

	test.concurrent(
		"refuses a mutation whose result contradicts its changes",
		() => {
			const mutation = trackMutation({
				state: createState(),
				command: createTrackCommand(),
			});
			const result = trackResultOf({ mutation });

			expect(() => validateTrackMutation({ mutation })).not.toThrow();
			expect(() =>
				validateTrackMutation({
					mutation: { ...mutation, result: { ...result, appliedValue: 4 } },
				}),
			).toThrow("Invalid track mutation");
			expect(() =>
				validateTrackMutation({
					mutation: { ...mutation, result: { ...result, balanceAfter: 6 } },
				}),
			).toThrow("Invalid track mutation");
			expect(() =>
				validateTrackMutation({
					mutation: {
						...mutation,
						changes: [
							{
								table: "customerEntitlements",
								op: "update",
								id: "messages_monthly",
								before: { balance: 10 },
								after: { balance: 6 },
							},
						],
					},
				}),
			).toThrow("Invalid track mutation");
			expect(() =>
				validateTrackMutation({
					mutation: {
						...mutation,
						changes: [
							{
								table: "customerEntitlements",
								op: "insert",
								row: createCustomerEntitlement(),
							},
						],
					},
				}),
			).toThrow("Invalid track mutation");
		},
	);
});

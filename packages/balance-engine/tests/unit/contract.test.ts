import { describe, expect, test } from "bun:test";
import * as balanceEngine from "../../src/balanceEngine.js";
import {
	computeCheck,
	computeTrack,
	createCustomerMeteringState,
	executeTrack,
	parseCheckCommand,
	parseCustomerMeteringState,
	parseTrackCommand,
	parseTrackOutcome,
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

const createTrackCommand = ({
	requestId = "req_1",
	properties = null,
	occurredAt = 1_700_000_000_000,
	overageBehavior = "reject",
}: {
	requestId?: string;
	properties?: Record<string, unknown> | null;
	occurredAt?: number;
	overageBehavior?: "cap" | "reject" | "overflow";
} = {}) =>
	parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId: "cmd_1",
			requestId,
			identity,
			entityId: null,
			featureId: "messages",
			value: 5,
			overageBehavior,
			properties,
			occurredAt,
		},
	});

const createCheckCommand = ({
	properties = null,
}: {
	properties?: Record<string, unknown> | null;
} = {}) =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			requestId: "req_check_1",
			identity,
			entityId: null,
			featureId: "messages",
			requiredBalance: 1,
			properties,
			occurredAt: 1_700_000_000_000,
		},
	});

const requireNewOutcome = (decision: ReturnType<typeof computeTrack>) => {
	if (decision.kind !== "new") {
		throw new Error(`Expected a new outcome, received ${decision.kind}`);
	}
	return decision.outcome;
};

describe("balance engine contract boundaries", () => {
	test("names property-sensitive commands as unsupported", () => {
		expect(
			computeTrack({
				state: createState(),
				command: createTrackCommand({ properties: { region: "eu" } }),
			}),
		).toEqual({ kind: "unsupported", reason: "properties_not_supported" });
		expect(
			computeCheck({
				state: createState(),
				command: createCheckCommand({ properties: { region: "eu" } }),
			}),
		).toEqual({ kind: "unsupported", reason: "properties_not_supported" });
	});

	test("rejects properties that cannot survive JSON transport", () => {
		expect(() => createTrackCommand({ properties: { unsafe: 1n } })).toThrow();
		expect(() =>
			createTrackCommand({ properties: { unsafe: undefined } }),
		).toThrow();
	});

	test("treats attempt metadata changes as the same logical command", () => {
		const state = createState();
		const outcome = requireNewOutcome(
			computeTrack({ state, command: createTrackCommand() }),
		);
		const appliedState = executeTrack({ state, outcome }).state;

		expect(
			computeTrack({
				state: appliedState,
				existingReceipt: outcome,
				command: createTrackCommand({
					requestId: "req_2",
					occurredAt: 1_700_000_000_001,
				}),
			}),
		).toEqual({ kind: "duplicate", outcome });
	});

	test("rejects outcomes whose metadata contradicts their mutations", () => {
		const outcome = requireNewOutcome(
			computeTrack({ state: createState(), command: createTrackCommand() }),
		);

		for (const input of [
			{ ...outcome, appliedValue: 4 },
			{ ...outcome, balanceAfter: 6 },
			{
				...outcome,
				mutations: [{ ...outcome.mutations[0], usageAfter: 4 }],
			},
			{ ...outcome, commandFingerprint: "incorrect" },
		]) {
			expect(() => parseTrackOutcome({ input })).toThrow();
		}
	});

	test("rejects capped outcomes that exceed available balance", () => {
		const outcome = requireNewOutcome(
			computeTrack({
				state: createState({ balance: 3 }),
				command: createTrackCommand({ overageBehavior: "cap" }),
			}),
		);

		expect(() =>
			parseTrackOutcome({
				input: {
					...outcome,
					appliedValue: 4,
					balanceAfter: -1,
					mutations: [
						{
							...outcome.mutations[0],
							balanceAfter: -1,
							usageAfter: 4,
						},
					],
				},
			}),
		).toThrow();
	});

	test("returns API-compatible remaining balance after overflow", () => {
		const result = computeCheck({
			state: createState({ balance: -2 }),
			command: createCheckCommand(),
		});

		expect(result).toMatchObject({
			kind: "decided",
			allowed: false,
			balance: 0,
		});
	});

	test("uses an explicitly versioned direct-metered state shape", () => {
		expect(() =>
			parseCustomerMeteringState({
				input: {
					schemaVersion: 1,
					identity,
					revision: 0,
					featureStatesById: {
						messages: {
							kind: "direct_metered_v1",
							customerEntitlements: [
								{ id: "messages_monthly", balance: 10, usage: 0 },
							],
						},
					},
				},
			}),
		).not.toThrow();
		expect(() =>
			parseCustomerMeteringState({
				input: {
					...createState(),
					featureStatesById: {
						messages: {
							customerEntitlements: [
								{ id: "messages_monthly", balance: 10, usage: 0 },
							],
						},
					},
				},
			}),
		).toThrow();
	});

	test("keeps validation libraries behind parser functions", () => {
		expect(
			Object.keys(balanceEngine).filter((exportName) =>
				exportName.endsWith("Schema"),
			),
		).toEqual([]);
	});

	test("keeps receipts outside the bounded customer balance state", () => {
		expect(createState()).not.toHaveProperty("receipts");
	});
});

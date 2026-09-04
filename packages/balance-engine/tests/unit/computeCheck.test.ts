import { describe, expect, test } from "bun:test";
import {
	computeCheck,
	computeTrack,
	createCustomerMeteringState,
	executeTrack,
	parseCheckCommand,
	parseTrackCommand,
} from "../../src/balanceEngine.js";

const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
} as const;

const createState = () =>
	createCustomerMeteringState({
		identity,
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [
					{ id: "messages_monthly", balance: 10, usage: 0 },
				],
			},
		},
	});

const createCheckCommand = ({
	requiredBalance = 5,
}: {
	requiredBalance?: number;
} = {}) =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			requestId: "req_check_1",
			identity,
			entityId: null,
			featureId: "messages",
			requiredBalance,
			properties: null,
			occurredAt: 1_700_000_000_000,
		},
	});

describe("check computation", () => {
	test.concurrent("reads a balance without changing state", () => {
		const state = createState();
		const result = computeCheck({ state, command: createCheckCommand() });

		expect(result).toEqual({
			kind: "decided",
			allowed: true,
			reason: null,
			balance: 10,
			requiredBalance: 5,
			revision: 0,
		});
		expect(state).toEqual(createState());
	});

	test.concurrent("rejects a requirement above the available balance", () => {
		const result = computeCheck({
			state: createState(),
			command: createCheckCommand({ requiredBalance: 11 }),
		});

		expect(result).toMatchObject({
			kind: "decided",
			allowed: false,
			reason: "insufficient_balance",
			balance: 10,
		});
	});

	test.concurrent("observes a track only after its outcome is applied", () => {
		const state = createState();
		const trackCommand = parseTrackCommand({
			input: {
				schemaVersion: 1,
				type: "track",
				commandId: "cmd_1",
				requestId: "req_track_1",
				identity,
				entityId: null,
				featureId: "messages",
				value: 5,
				overageBehavior: "reject",
				properties: null,
				occurredAt: 1_700_000_000_000,
			},
		});
		const decision = computeTrack({
			state,
			command: trackCommand,
			deduplicationExpiresAt: 1_700_086_400_000,
		});
		if (decision.kind !== "new") throw new Error("Expected a new outcome");

		expect(
			computeCheck({ state, command: createCheckCommand() }),
		).toMatchObject({ balance: 10 });

		const appliedState = executeTrack({
			state,
			outcome: decision.outcome,
		}).state;

		expect(
			computeCheck({ state: appliedState, command: createCheckCommand() }),
		).toMatchObject({ balance: 5, revision: 1 });
	});

	test.concurrent("names unsupported reads instead of guessing", () => {
		const missingFeature = computeCheck({
			state: createCustomerMeteringState({
				identity,
				featureStatesById: {},
			}),
			command: createCheckCommand(),
		});
		const entityCommand = {
			...createCheckCommand(),
			entityId: "entity_1",
		};
		const inheritedFeatureCommand = {
			...createCheckCommand(),
			featureId: "constructor",
		};
		const multipleCustomerEntitlementState = createCustomerMeteringState({
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
		});

		expect(missingFeature).toEqual({
			kind: "unsupported",
			reason: "feature_not_found",
		});
		expect(
			computeCheck({ state: createState(), command: entityCommand }),
		).toEqual({
			kind: "unsupported",
			reason: "entity_not_supported",
		});
		expect(
			computeCheck({
				state: createState(),
				command: inheritedFeatureCommand,
			}),
		).toEqual({
			kind: "unsupported",
			reason: "feature_not_found",
		});
		expect(
			computeCheck({
				state: multipleCustomerEntitlementState,
				command: createCheckCommand(),
			}),
		).toEqual({
			kind: "unsupported",
			reason: "multiple_customer_entitlements_not_supported",
		});
	});
});

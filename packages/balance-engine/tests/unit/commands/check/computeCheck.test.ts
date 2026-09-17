import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeCheck as computeCheckDecision,
	computeTrack,
	type SubjectState,
} from "../../../../src/balanceEngine.js";
import {
	createCheckCommand,
	createCustomerEntitlement,
	createState,
	createSubjectFor,
	createTrackCommand,
	deduplicationExpiresAt,
	identity,
	requireNewMutation,
} from "../../engineFixtures.js";

const computeCheck = ({
	state,
	command,
}: {
	state: SubjectState;
	command: Parameters<typeof computeCheckDecision>[0]["command"];
}) =>
	computeCheckDecision({
		fullSubject: createSubjectFor({
			state,
			entityId: command.identity.entityId,
		}),
		command,
	});

describe("check computation", () => {
	test.concurrent("reads a balance without changing state", () => {
		const state = createState();
		const decision = computeCheck({ state, command: createCheckCommand() });

		expect(decision).toEqual({
			kind: "decided",
			allowed: true,
			reason: null,
			balance: 10,
			customerEntitlement: createCustomerEntitlement(),
			requiredBalance: 5,
			revision: 0,
		});
		expect(state).toEqual(createState());
	});

	test.concurrent("refuses a requirement above the available balance", () => {
		expect(
			computeCheck({
				state: createState(),
				command: createCheckCommand({ requiredBalance: 11 }),
			}),
		).toMatchObject({
			kind: "decided",
			allowed: false,
			reason: "insufficient_balance",
			balance: 10,
		});
	});

	test.concurrent("reports an overdrawn row as zero remaining", () => {
		expect(
			computeCheck({
				state: createState({ balance: -2 }),
				command: createCheckCommand({ requiredBalance: 1 }),
			}),
		).toMatchObject({ kind: "decided", allowed: false, balance: 0 });
	});

	test.concurrent("observes a track only after its mutation is applied", () => {
		const state = createState();
		const mutation = requireNewMutation(
			computeTrack({
				fullSubject: createSubjectFor({ state }),
				command: createTrackCommand(),
				deduplicationExpiresAt,
			}),
		);

		expect(
			computeCheck({ state, command: createCheckCommand() }),
		).toMatchObject({ balance: 10, revision: 0 });
		expect(
			computeCheck({
				state: applyMutation({ state, mutation }),
				command: createCheckCommand(),
			}),
		).toMatchObject({ balance: 5, revision: 1 });
	});

	test.concurrent("names unsupported reads instead of guessing", () => {
		expect(
			computeCheck({
				state: createState(),
				command: {
					...createCheckCommand(),
					identity: { ...identity, customerId: "cus_2" },
				},
			}),
		).toEqual({ kind: "unsupported", reason: "subject_mismatch" });
		expect(
			computeCheck({
				state: createState(),
				command: createCheckCommand({ entityId: "entity_1" }),
			}),
		).toEqual({ kind: "unsupported", reason: "entity_not_found" });
		expect(
			computeCheck({
				state: createState(),
				command: createCheckCommand({ properties: { region: "eu" } }),
			}),
		).toEqual({ kind: "unsupported", reason: "properties_not_supported" });
		expect(
			computeCheck({
				state: createState({ customerEntitlements: [] }),
				command: createCheckCommand(),
			}),
		).toEqual({ kind: "unsupported", reason: "feature_not_found" });
		expect(
			computeCheck({
				state: createState(),
				command: createCheckCommand({ featureId: "constructor" }),
			}),
		).toEqual({ kind: "unsupported", reason: "feature_not_found" });
		expect(
			computeCheck({
				state: createState({
					customerEntitlements: [
						createCustomerEntitlement({ id: "messages_monthly", balance: 5 }),
						createCustomerEntitlement({ id: "messages_rollover", balance: 5 }),
					],
				}),
				command: createCheckCommand(),
			}),
		).toEqual({
			kind: "unsupported",
			reason: "multiple_customer_entitlements_not_supported",
		});
	});
});

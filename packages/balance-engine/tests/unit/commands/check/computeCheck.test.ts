import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeCheck as computeCheckResult,
	computeTrack,
	type SubjectState,
	UnsupportedCommandError,
} from "../../../../src/balanceEngine.js";
import {
	createCheckCommand,
	createState,
	createSubjectFor,
	createTrackCommand,
	identity,
} from "../../engineFixtures.js";

const computeCheck = ({
	state,
	command,
}: {
	state: SubjectState;
	command: Parameters<typeof computeCheckResult>[0]["command"];
}) =>
	computeCheckResult({
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
			allowed: true,
			reason: null,
			requiredBalance: 5,
		});
		expect(state).toEqual(createState());
	});

	test.concurrent("refuses a requirement above the available balance", () => {
		expect(
			computeCheck({
				state: createState(),
				command: createCheckCommand({ requiredBalance: 11 }),
			}),
		).toEqual({
			allowed: false,
			reason: "insufficient_balance",
			requiredBalance: 11,
		});
	});

	test.concurrent("refuses to draw from an overdrawn row", () => {
		expect(
			computeCheck({
				state: createState({ balance: -2 }),
				command: createCheckCommand({ requiredBalance: 1 }),
			}),
		).toMatchObject({ allowed: false });
	});

	test.concurrent("observes a track only after its mutation is applied", () => {
		const state = createState();
		const mutation = computeTrack({
			fullSubject: createSubjectFor({ state }),
			command: createTrackCommand(),
		});

		const command = createCheckCommand({ requiredBalance: 10 });
		expect(computeCheck({ state, command })).toMatchObject({ allowed: true });
		expect(
			computeCheck({ state: applyMutation({ state, mutation }), command }),
		).toMatchObject({ allowed: false });
	});

	test.concurrent("refuses unsupported reads instead of guessing", () => {
		expect(() =>
			computeCheck({
				state: createState(),
				command: {
					...createCheckCommand(),
					identity: { ...identity, customerId: "cus_2" },
				},
			}),
		).toThrow(new UnsupportedCommandError({ reason: "subject_mismatch" }));
		expect(() =>
			computeCheck({
				state: createState(),
				command: createCheckCommand({ entityId: "entity_1" }),
			}),
		).toThrow(new UnsupportedCommandError({ reason: "entity_not_found" }));
		expect(() =>
			computeCheck({
				state: createState(),
				command: createCheckCommand({ properties: { region: "eu" } }),
			}),
		).toThrow(
			new UnsupportedCommandError({ reason: "properties_not_supported" }),
		);
		expect(() =>
			computeCheck({
				state: createState({ customerEntitlements: [] }),
				command: createCheckCommand(),
			}),
		).toThrow(new UnsupportedCommandError({ reason: "feature_not_found" }));
		expect(() =>
			computeCheck({
				state: createState(),
				command: createCheckCommand({ featureId: "constructor" }),
			}),
		).toThrow(new UnsupportedCommandError({ reason: "feature_not_found" }));
	});
});

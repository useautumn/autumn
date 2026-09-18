import { describe, expect, test } from "bun:test";
import {
	computeTrack as computeTrackMutation,
	type SubjectState,
	type SubjectStateMutation,
	UnsupportedCommandError,
} from "../../../../src/balanceEngine.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
	identity,
	trackResultOf,
} from "../../engineFixtures.js";

type TrackInput = {
	state: SubjectState;
	command: Parameters<typeof computeTrackMutation>[0]["command"];
};

const trackMutation = ({ state, command }: TrackInput) =>
	computeTrackMutation({
		fullSubject: createSubjectFor({
			state,
			entityId: command.identity.entityId,
		}),
		command,
	});

const updateChangesOf = ({ mutation }: { mutation: SubjectStateMutation }) =>
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
		expect(trackResultOf({ mutation })).toEqual({
			type: "track",
			status: "applied",
			reason: null,
			deltas: [
				{
					table: "customerEntitlements",
					id: "messages_monthly",
					entityKey: null,
					balanceDelta: -5,
					usageDelta: 0,
					valueDelta: -5,
					creditCost: 1,
				},
			],
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
			deltas: [{ id: "messages_monthly", valueDelta: -3 }],
		});
	});

	test.concurrent("rejects without changing any row", () => {
		const mutation = trackMutation({
			state: createState({ balance: 3 }),
			command: createTrackCommand({ value: 5 }),
		});

		expect(mutation.changes).toEqual([]);
		expect(trackResultOf({ mutation })).toEqual({
			type: "track",
			status: "rejected",
			reason: "insufficient_balance",
			deltas: [],
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
		// The included bucket gives what it has, then the overage bucket takes the row negative.
		expect(trackResultOf({ mutation })).toMatchObject({
			status: "applied",
			deltas: [
				{ id: "messages_monthly", balanceDelta: -3, valueDelta: -3 },
				{ id: "messages_monthly", balanceDelta: -2, valueDelta: -2 },
			],
		});
	});

	test.concurrent("refuses every input outside the supported path", () => {
		const otherSubjectState = createState();
		const commandForOtherCustomer = {
			...createTrackCommand(),
			identity: { ...identity, customerId: "cus_2" },
		};

		expect(() =>
			trackMutation({
				state: otherSubjectState,
				command: commandForOtherCustomer,
			}),
		).toThrow(new UnsupportedCommandError({ reason: "subject_mismatch" }));
		expect(() =>
			trackMutation({
				state: createState(),
				command: createTrackCommand({ entityId: "entity_1" }),
			}),
		).toThrow(new UnsupportedCommandError({ reason: "entity_not_found" }));
		expect(() =>
			trackMutation({
				state: createState({ customerEntitlements: [] }),
				command: createTrackCommand(),
			}),
		).toThrow(new UnsupportedCommandError({ reason: "feature_not_found" }));
		expect(() =>
			trackMutation({
				state: createState(),
				command: createTrackCommand({ featureId: "constructor" }),
			}),
		).toThrow(new UnsupportedCommandError({ reason: "feature_not_found" }));
	});
});

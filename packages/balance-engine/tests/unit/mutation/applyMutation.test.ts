import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeInitialize,
	computeTrack,
	createSubjectState,
	MutationSubjectMismatchError,
	OutOfOrderMutationError,
	StaleMutationError,
	type SubjectState,
	type SubjectStateMutation,
} from "../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createEntityState,
	createInitializeCommand,
	createState,
	createSubjectFor,
	createTrackCommand,
	deduplicationExpiresAt,
	identity,
	requireNewMutation,
} from "../engineFixtures.js";

const initializeMutation = computeInitialize({
	command: createInitializeCommand(),
	deduplicationExpiresAt,
});

const trackMutationOn = ({ state }: { state: SubjectState }) =>
	requireNewMutation(
		computeTrack({
			fullSubject: createSubjectFor({ state }),
			command: createTrackCommand(),
			deduplicationExpiresAt,
		}),
	);

const withChanges = ({
	mutation,
	changes,
}: {
	mutation: SubjectStateMutation;
	changes: SubjectStateMutation["changes"];
}): SubjectStateMutation => ({ ...mutation, changes });

describe("mutation application", () => {
	test.concurrent("initializes a customer that has no state yet", () => {
		const state = applyMutation({ state: null, mutation: initializeMutation });

		expect(state).toEqual({
			...createState(),
			revision: 1,
		});
	});

	test.concurrent("applies a track onto the initialized state", () => {
		const initializedState = applyMutation({
			state: null,
			mutation: initializeMutation,
		});
		const nextState = applyMutation({
			state: initializedState,
			mutation: trackMutationOn({ state: initializedState }),
		});

		expect(nextState.revision).toBe(2);
		expect(
			nextState.customerEntitlements.find(
				(row) => row.id === "messages_monthly",
			),
		).toMatchObject({ balance: 5 });
	});

	test.concurrent("refuses a mutation decided against stale rows", () => {
		const state = createState();

		expect(() =>
			applyMutation({
				state: createState({ balance: 9 }),
				mutation: trackMutationOn({ state }),
			}),
		).toThrow(StaleMutationError);
	});

	test.concurrent("refuses a mutation decided against another revision", () => {
		const state = createState();
		const mutation = trackMutationOn({ state });
		const advancedState = applyMutation({ state, mutation });

		expect(() => applyMutation({ state: advancedState, mutation })).toThrow(
			OutOfOrderMutationError,
		);
	});

	test.concurrent("refuses a mutation owned by another customer", () => {
		const otherIdentity = { ...identity, customerId: "cus_2" };
		const otherState = createSubjectState({
			identity: otherIdentity,
			customerProducts: [createCustomerProduct()],
			customerEntitlements: [createCustomerEntitlement()],
		});
		const otherMutation = requireNewMutation(
			computeTrack({
				fullSubject: createSubjectFor({ state: otherState }),
				command: { ...createTrackCommand(), identity: otherIdentity },
				deduplicationExpiresAt,
			}),
		);

		expect(() =>
			applyMutation({ state: createState(), mutation: otherMutation }),
		).toThrow(MutationSubjectMismatchError);
	});

	test.concurrent(
		"refuses a customer initialize onto an existing state",
		() => {
			expect(() =>
				applyMutation({ state: createState(), mutation: initializeMutation }),
			).toThrow(OutOfOrderMutationError);
		},
	);

	test.concurrent(
		"an entity initialize adds the entity and its rows to the view",
		() => {
			const state = { ...createState(), revision: 4 };
			const mutation = computeInitialize({
				command: createInitializeCommand({ state: createEntityState() }),
				revisionBefore: 4,
				deduplicationExpiresAt,
			});

			const next = applyMutation({ state, mutation });

			expect(next.revision).toBe(5);
			expect(next.entity?.id).toBe("ent_42");
			expect(next.customerEntitlements.map((row) => row.id)).toEqual([
				"messages_monthly",
				"seats_ent_42",
			]);
			expect(() => applyMutation({ state: next, mutation })).toThrow(
				OutOfOrderMutationError,
			);
		},
	);

	test.concurrent(
		"refuses changes that address rows the state disagrees on",
		() => {
			const state = createState();
			const mutation = trackMutationOn({ state });

			expect(() =>
				applyMutation({
					state,
					mutation: withChanges({
						mutation,
						changes: [
							{
								table: "customerEntitlements",
								op: "update",
								id: "messages_rollover",
								before: { balance: 10 },
								after: { balance: 5 },
							},
						],
					}),
				}),
			).toThrow(StaleMutationError);
			expect(() =>
				applyMutation({
					state: null,
					mutation: withChanges({
						mutation: initializeMutation,
						changes: [
							...initializeMutation.changes,
							...initializeMutation.changes,
						],
					}),
				}),
			).toThrow(StaleMutationError);
			expect(() =>
				applyMutation({
					state,
					mutation: withChanges({
						mutation,
						changes: [
							{
								table: "customerEntitlements",
								op: "delete",
								id: "messages_rollover",
							},
						],
					}),
				}),
			).toThrow(StaleMutationError);
		},
	);

	test.concurrent("deletes the row a change names", () => {
		const state = createState();
		const nextState = applyMutation({
			state,
			mutation: withChanges({
				mutation: trackMutationOn({ state }),
				changes: [
					{
						table: "customerEntitlements",
						op: "delete",
						id: "messages_monthly",
					},
				],
			}),
		});

		expect(nextState).toEqual({
			...createState(),
			revision: 1,
			customerEntitlements: [],
		});
	});
});

import { describe, expect, test } from "bun:test";
import {
	applyChanges,
	applyMutation,
	computeInitialize,
	computeTrack,
	IrreversibleChangeError,
	revertChanges,
	StaleMutationError,
} from "../../../src/balanceEngine.js";
import {
	createEntityState,
	createInitializeRequest,
	createState,
	createSubjectFor,
	createTrackCommand,
} from "../engineFixtures.js";

describe("reverting changes", () => {
	test.concurrent("undoes a track's updates back to the rows before it", () => {
		const state = createState({ balance: 10 });
		const mutation = computeTrack({
			fullSubject: createSubjectFor({ state }),
			command: createTrackCommand({ value: 4, overageBehavior: "cap" }),
		});
		const after = applyChanges({ state, changes: mutation.changes });

		expect(after.customerEntitlements[0]?.balance).toBe(6);
		expect(revertChanges({ state: after, changes: mutation.changes })).toEqual(
			state,
		);
	});

	test.concurrent(
		"undoes an entity initialize by removing what it inserted",
		() => {
			const customerState = applyMutation({
				state: null,
				mutation: computeInitialize(createInitializeRequest()),
			});
			const entityMutation = computeInitialize({
				...createInitializeRequest({
					commandId: "init_entity",
					state: createEntityState(),
				}),
				revisionBefore: customerState.revision,
			});
			const withEntity = applyChanges({
				state: customerState,
				changes: entityMutation.changes,
			});

			expect(withEntity.entity).not.toBeNull();
			expect(
				revertChanges({ state: withEntity, changes: entityMutation.changes }),
			).toEqual(customerState);
		},
	);

	test.concurrent(
		"refuses rows that no longer read as the change left them",
		() => {
			const state = createState({ balance: 10 });
			const mutation = computeTrack({
				fullSubject: createSubjectFor({ state }),
				command: createTrackCommand({ value: 4, overageBehavior: "cap" }),
			});

			expect(() => revertChanges({ state, changes: mutation.changes })).toThrow(
				StaleMutationError,
			);
		},
	);

	test.concurrent("refuses a delete, which carries no row to restore", () => {
		const state = createState();
		expect(() =>
			revertChanges({
				state,
				changes: [{ table: "rollovers", op: "delete", id: "ro_1" }],
			}),
		).toThrow(IrreversibleChangeError);
	});

	test.concurrent(
		"leaves the customer row in place: it anchors the state",
		() => {
			const state = createState();
			expect(
				revertChanges({
					state,
					changes: [{ table: "customer", op: "insert", row: state.customer }],
				}),
			).toEqual(state);
		},
	);
});

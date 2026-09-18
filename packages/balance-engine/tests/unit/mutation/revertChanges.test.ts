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
		"an increment is given back whatever the row holds; an update must still read as it left the row",
		() => {
			const state = createState({ balance: 10 });
			const mutation = computeTrack({
				fullSubject: createSubjectFor({ state }),
				command: createTrackCommand({ value: 4, overageBehavior: "cap" }),
			});

			expect(
				revertChanges({ state, changes: mutation.changes })
					.customerEntitlements[0]?.balance,
			).toBe(14);
			expect(() =>
				revertChanges({
					state,
					changes: [
						{
							table: "customerEntitlements",
							op: "update",
							id: "messages_monthly",
							before: { balance: 12 },
							after: { balance: 6 },
						},
					],
				}),
			).toThrow(StaleMutationError);
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

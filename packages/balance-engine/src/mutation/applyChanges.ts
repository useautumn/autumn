import { isDeepStrictEqual } from "node:util";
import { StaleMutationError } from "../errors.js";
import type { CustomerState } from "../models/customerState.js";
import type { RowChange } from "../models/rowChange.js";
import type { LeanCustomerEntitlement } from "../models/rows/leanCustomerEntitlement.js";

const rowMatchesBefore = ({
	row,
	before,
}: {
	row: LeanCustomerEntitlement;
	before: Partial<LeanCustomerEntitlement>;
}): boolean => {
	const currentFields: Record<string, unknown> = row;

	return Object.entries(before).every(([field, value]) =>
		isDeepStrictEqual(currentFields[field], value),
	);
};

/** Generic over the change list: it never knows which command produced the changes. */
export const applyChanges = ({
	state,
	changes,
}: {
	state: CustomerState;
	changes: RowChange[];
}): CustomerState => {
	if (changes.length === 0) return state;

	const customerEntitlements = { ...state.customerEntitlements };
	const rowOf = ({
		id,
	}: {
		id: string;
	}): LeanCustomerEntitlement | undefined =>
		Object.hasOwn(customerEntitlements, id)
			? customerEntitlements[id]
			: undefined;

	for (const change of changes) {
		switch (change.op) {
			case "insert": {
				if (rowOf({ id: change.row.id })) {
					throw new StaleMutationError({ subject: change.row.id });
				}
				customerEntitlements[change.row.id] = change.row;
				break;
			}
			case "update": {
				const row = rowOf({ id: change.id });
				if (!row || !rowMatchesBefore({ row, before: change.before })) {
					throw new StaleMutationError({ subject: change.id });
				}
				customerEntitlements[change.id] = { ...row, ...change.after };
				break;
			}
			case "delete": {
				if (!rowOf({ id: change.id })) {
					throw new StaleMutationError({ subject: change.id });
				}
				delete customerEntitlements[change.id];
				break;
			}
		}
	}

	return { ...state, customerEntitlements };
};

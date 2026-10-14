import { StaleMutationError } from "../../../errors.js";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { SubjectState } from "../../../models/subject/subjectState.js";
import type { BillingPlanDeleteOp } from "../types/billingPlanOp.js";
import { heldProductIsAsExpected } from "./heldProductIsAsExpected.js";
import {
	type PlanRowChangeContext,
	rowKeyOf,
	wasDeletedByPlan,
} from "./planRowChangeContext.js";
import { rowHoldsExpectedColumns } from "./rowHoldsExpectedColumns.js";

type StateDeleteOp = Exclude<
	BillingPlanDeleteOp,
	{ table: "pooledContributions" }
>;
type DeletedRow = { table: StateDeleteOp["table"]; id: string };

const rolloversOf = ({
	state,
	customerEntitlementId,
}: {
	state: SubjectState;
	customerEntitlementId: string;
}): DeletedRow[] =>
	state.rollovers
		.filter(({ cus_ent_id }) => cus_ent_id === customerEntitlementId)
		.map(({ id }) => ({ table: "rollovers", id }));

/** Children first, as Postgres cascades them: a product's prices and grants, a grant's rollovers. */
const cascadeOf = ({
	state,
	row,
}: {
	state: SubjectState;
	row: DeletedRow;
}): DeletedRow[] => {
	if (row.table === "customerEntitlements")
		return rolloversOf({ state, customerEntitlementId: row.id });
	if (row.table !== "customerProducts") return [];
	const prices = state.customerPrices
		.filter(({ customer_product_id }) => customer_product_id === row.id)
		.map(({ id }): DeletedRow => ({ table: "customerPrices", id }));
	const grants = state.customerEntitlements
		.filter(({ customer_product_id }) => customer_product_id === row.id)
		.flatMap(({ id }): DeletedRow[] => [
			...rolloversOf({ state, customerEntitlementId: id }),
			{ table: "customerEntitlements", id },
		]);
	return [...prices, ...grants];
};

const findHeldRow = ({
	state,
	row,
}: {
	state: SubjectState;
	row: DeletedRow;
}): object | undefined =>
	state[row.table].find(({ id }: { id: string }) => id === row.id);

const grantGainedRollovers = ({
	state,
	op,
}: {
	state: SubjectState;
	op: StateDeleteOp;
}): boolean =>
	op.table === "customerEntitlements" &&
	op.withoutRollovers === true &&
	rolloversOf({ state, customerEntitlementId: op.id }).length > 0;

const grantProductIsAsExpected = ({
	context,
	op,
	heldRow,
}: {
	context: PlanRowChangeContext;
	op: StateDeleteOp;
	heldRow: object;
}): boolean =>
	op.table !== "customerEntitlements" ||
	heldProductIsAsExpected({
		context,
		customerProductId: Reflect.get(heldRow, "customer_product_id"),
		expectProduct: op.expectProduct,
	});

const heldRowIsAsExpected = ({
	context,
	state,
	op,
}: {
	context: PlanRowChangeContext;
	state: SubjectState;
	op: StateDeleteOp;
}): boolean => {
	const heldRow = findHeldRow({ state, row: op });
	if (!heldRow) return false;
	if (!rowHoldsExpectedColumns({ row: heldRow, expect: op.expect }))
		return false;
	if (!grantProductIsAsExpected({ context, op, heldRow })) return false;
	return !grantGainedRollovers({ state, op });
};

/** A plan deletes rows it found, and each once: a row an earlier op already took with its parent is skipped. */
export const deleteOpToRowChanges = ({
	op,
	context,
}: {
	op: StateDeleteOp;
	context: PlanRowChangeContext;
}): RowChange[] => {
	const { state } = context;
	if (wasDeletedByPlan({ context, table: op.table, id: op.id })) return [];
	if (!state || !heldRowIsAsExpected({ context, state, op }))
		throw new StaleMutationError({ subject: op.id });

	const rows = [...cascadeOf({ state, row: op }), op].filter(
		(row) => !wasDeletedByPlan({ context, ...row }),
	);
	for (const row of rows) context.deletedRowKeys.add(rowKeyOf(row));
	return rows.map(({ table, id }) => ({ table, op: "delete", id }));
};

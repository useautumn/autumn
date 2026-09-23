import { StaleMutationError } from "../../../errors.js";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { SubjectState } from "../../../models/subject/subjectState.js";
import type { BillingPlanDeleteOp } from "../types/billingPlanOp.js";
import {
	type PlanRowChangeContext,
	rowKeyOf,
	wasDeletedByPlan,
} from "./planRowChangeContext.js";

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

const holdsRow = ({ state, row }: { state: SubjectState; row: DeletedRow }) =>
	state[row.table].some(({ id }) => id === row.id);

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
	if (!state || !holdsRow({ state, row: op }))
		throw new StaleMutationError({ subject: op.id });

	const rows = [...cascadeOf({ state, row: op }), op].filter(
		(row) => !wasDeletedByPlan({ context, ...row }),
	);
	for (const row of rows) context.deletedRowKeys.add(rowKeyOf(row));
	return rows.map(({ table, id }) => ({ table, op: "delete", id }));
};

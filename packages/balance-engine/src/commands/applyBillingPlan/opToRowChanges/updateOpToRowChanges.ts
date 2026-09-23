import { StaleMutationError } from "../../../errors.js";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { BillingPlanUpdateOp } from "../types/billingPlanOp.js";
import {
	findPlanRow,
	type PlanRowChangeContext,
	wasDeletedByPlan,
} from "./planRowChangeContext.js";

/** The columns the update sets, as the row holds them now: what it replaced, for the log's readers. */
const columnsBefore = ({
	row,
	set,
}: {
	row: object;
	set: object;
}): Record<string, unknown> =>
	Object.fromEntries(
		Object.keys(set)
			.filter((column) => column in row)
			.map((column) => [column, Reflect.get(row, column)]),
	);

const holdsOnlyNulls = ({ row, set }: { row: object; set: object }) =>
	Object.keys(set).every((column) => Reflect.get(row, column) == null);

const customerUpdate = ({
	op,
	context,
}: {
	op: Extract<BillingPlanUpdateOp, { table: "customer" }>;
	context: PlanRowChangeContext;
}): RowChange[] => {
	const customer = context.state?.customer;
	if (customer?.internal_id !== op.id)
		throw new StaleMutationError({ subject: op.id });
	if (op.whereUnset && !holdsOnlyNulls({ row: customer, set: op.set }))
		return [];
	return [
		{
			table: "customer",
			op: "update",
			id: op.id,
			before: columnsBefore({ row: customer, set: op.set }),
			after: op.set,
		},
	];
};

/** A plan updates rows it found; an update of a row it already deleted changes nothing, as an UPDATE of a gone row does. */
export const updateOpToRowChanges = ({
	op,
	context,
}: {
	op: Exclude<BillingPlanUpdateOp, { table: "pooledContributions" }>;
	context: PlanRowChangeContext;
}): RowChange[] => {
	if (op.table === "customer") return customerUpdate({ op, context });
	if (wasDeletedByPlan({ context, table: op.table, id: op.id })) return [];

	if (op.table === "customerProducts") {
		const row = context.state?.customerProducts.find(({ id }) => id === op.id);
		if (!row) throw new StaleMutationError({ subject: op.id });
		return [
			{
				table: op.table,
				op: "update",
				id: op.id,
				before: columnsBefore({ row, set: op.set }),
				after: op.set,
			},
		];
	}
	if (op.table === "pooledBalances") {
		const row = findPlanRow({ context, table: "pooledBalances", id: op.id });
		if (!row) throw new StaleMutationError({ subject: op.id });
		return [
			{
				table: op.table,
				op: "update",
				id: op.id,
				before: columnsBefore({ row, set: op.set }),
				after: op.set,
			},
		];
	}
	const row = findPlanRow({
		context,
		table: "customerEntitlements",
		id: op.id,
	});
	if (!row) throw new StaleMutationError({ subject: op.id });
	return [
		{
			table: op.table,
			op: "update",
			id: op.id,
			before: columnsBefore({ row, set: op.set }),
			after: op.set,
		},
	];
};

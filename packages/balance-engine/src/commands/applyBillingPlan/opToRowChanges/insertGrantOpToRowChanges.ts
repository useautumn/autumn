import { StaleMutationError } from "../../../errors.js";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { WorkerCustomerEntitlement } from "../../../models/subject/rows/workerCustomerEntitlement.js";
import type { BillingPlanInsertOp } from "../types/billingPlanOp.js";
import { heldProductIsAsExpected } from "./heldProductIsAsExpected.js";
import {
	type PlanRowChangeContext,
	wasDeletedByPlan,
} from "./planRowChangeContext.js";

type InsertGrantOp = Extract<
	BillingPlanInsertOp,
	{ table: "customerEntitlements" }
>;

const holdsParentProduct = ({
	context,
	row,
}: {
	context: PlanRowChangeContext;
	row: WorkerCustomerEntitlement;
}): boolean => {
	const customerProductId = row.customer_product_id;
	if (!customerProductId) return false;
	return (
		(context.state?.customerProducts ?? []).some(
			({ id }) => id === customerProductId,
		) &&
		!wasDeletedByPlan({
			context,
			table: "customerProducts",
			id: customerProductId,
		})
	);
};

const heldFeatureGrants = ({
	context,
	row,
}: {
	context: PlanRowChangeContext;
	row: WorkerCustomerEntitlement;
}): WorkerCustomerEntitlement[] =>
	[
		...(context.state?.customerEntitlements ?? []),
		...context.insertedRows.customerEntitlements,
	].filter(
		(held) =>
			held.customer_product_id === row.customer_product_id &&
			held.internal_feature_id === row.internal_feature_id &&
			!wasDeletedByPlan({
				context,
				table: "customerEntitlements",
				id: held.id,
			}),
	);

const holdsExactly = ({
	held,
	expected,
}: {
	held: WorkerCustomerEntitlement[];
	expected: Record<string, string>;
}): boolean =>
	held.length === Object.keys(expected).length &&
	held.every(({ id, entitlement_id }) => expected[id] === entitlement_id);

const featureGrantsAreAsExpected = ({
	context,
	row,
	expected,
}: {
	context: PlanRowChangeContext;
	row: WorkerCustomerEntitlement;
	expected: Record<string, string>;
}): boolean =>
	holdsParentProduct({ context, row }) &&
	holdsExactly({ held: heldFeatureGrants({ context, row }), expected });

const guardsHold = ({
	op,
	context,
}: {
	op: InsertGrantOp;
	context: PlanRowChangeContext;
}): boolean => {
	const { expectFeatureGrants, expectProduct, row } = op;
	if (
		expectFeatureGrants &&
		!featureGrantsAreAsExpected({ context, row, expected: expectFeatureGrants })
	)
		return false;
	return heldProductIsAsExpected({
		context,
		customerProductId: row.customer_product_id,
		expectProduct,
	});
};

export const insertGrantOpToRowChanges = ({
	op,
	context,
}: {
	op: InsertGrantOp;
	context: PlanRowChangeContext;
}): RowChange[] => {
	if (!guardsHold({ op, context }))
		throw new StaleMutationError({ subject: op.row.id });
	context.insertedRows.customerEntitlements.push(op.row);
	return [{ op: "insert", table: op.table, row: op.row }];
};

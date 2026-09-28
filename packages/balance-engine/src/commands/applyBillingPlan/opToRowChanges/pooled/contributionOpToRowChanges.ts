import { StaleMutationError } from "../../../../errors.js";
import type { RowChange } from "../../../../models/mutation/rowChange.js";
import type { WorkerCustomerEntitlement } from "../../../../models/subject/rows/workerCustomerEntitlement.js";
import type {
	BillingPlanDeleteOp,
	BillingPlanInsertOp,
	BillingPlanUpdateOp,
} from "../../types/billingPlanOp.js";
import {
	findPlanRow,
	type PlanRowChangeContext,
	wasDeletedByPlan,
} from "../planRowChangeContext.js";

type ContributionOp =
	| Extract<BillingPlanInsertOp, { table: "pooledContributions" }>
	| Extract<BillingPlanUpdateOp, { table: "pooledContributions" }>
	| Extract<BillingPlanDeleteOp, { table: "pooledContributions" }>;

/** A source holds no balance of its own once it contributes; the pool's row does. */
const zeroedSourceColumns = {
	balance: 0,
	adjustment: 0,
	additional_balance: 0,
	entities: null,
} as const;

const sourceBefore = ({
	source,
}: {
	source: WorkerCustomerEntitlement;
}): Partial<WorkerCustomerEntitlement> => ({
	balance: source.balance,
	adjustment: source.adjustment,
	additional_balance: source.additional_balance,
	entities: source.entities,
	pooled_contribution_id: source.pooled_contribution_id,
});

/** A new share: the row for the committer, its source zeroed. A source the plan cannot see, or one already contributing, means the worker's copy is behind. */
const insertContribution = ({
	op,
	context,
}: {
	op: Extract<ContributionOp, { op: "insert" }>;
	context: PlanRowChangeContext;
}): RowChange[] => {
	const { row } = op;
	const source = findPlanRow({
		context,
		table: "customerEntitlements",
		id: row.source_customer_entitlement_id,
	});
	if (!source || source.pooled_contribution_id)
		throw new StaleMutationError({
			subject: row.source_customer_entitlement_id,
		});
	return [
		{ table: "pooledContributions", op: "insert", row },
		{
			table: "customerEntitlements",
			op: "update",
			id: source.id,
			before: sourceBefore({ source }),
			after: { ...zeroedSourceColumns, pooled_contribution_id: row.id },
		},
	];
};

/** A share removed: its source is released, unless the plan already deleted it with its product. */
const deleteContribution = ({
	op,
	context,
}: {
	op: Extract<ContributionOp, { op: "delete" }>;
	context: PlanRowChangeContext;
}): RowChange[] => {
	const removal: RowChange = {
		table: "pooledContributions",
		op: "delete",
		id: op.id,
	};
	const sourceId = op.sourceCustomerEntitlementId;
	if (
		wasDeletedByPlan({ context, table: "customerEntitlements", id: sourceId })
	)
		return [removal];
	const source = findPlanRow({
		context,
		table: "customerEntitlements",
		id: sourceId,
	});
	// The share must be the one its source points at; anything else means the worker's copy is behind.
	if (source?.pooled_contribution_id !== op.id)
		throw new StaleMutationError({ subject: sourceId });
	return [
		removal,
		{
			table: "customerEntitlements",
			op: "update",
			id: source.id,
			before: { pooled_contribution_id: source.pooled_contribution_id },
			after: { pooled_contribution_id: null },
		},
	];
};

/** Share rows are never state: the record carries them for the committer, and the pool's totals move by the plan's own deltas. */
export const contributionOpToRowChanges = ({
	op,
	context,
}: {
	op: ContributionOp;
	context: PlanRowChangeContext;
}): RowChange[] => {
	switch (op.op) {
		case "insert":
			return insertContribution({ op, context });
		case "update":
			return [
				{
					table: "pooledContributions",
					op: "update",
					id: op.id,
					before: {},
					after: op.set,
				},
			];
		case "delete":
			return deleteContribution({ op, context });
	}
};

import type { WorkerCustomerEntitlement } from "../../../models/subject/rows/workerCustomerEntitlement.js";
import type { WorkerPooledBalance } from "../../../models/subject/rows/workerPooledBalance.js";
import type { SubjectState } from "../../../models/subject/subjectState.js";

export type PlanRowChangeContext = {
	state: SubjectState | null;
	insertedRows: {
		customerEntitlements: WorkerCustomerEntitlement[];
		pooledBalances: WorkerPooledBalance[];
	};
	deletedRowKeys: Set<string>;
};

export const createPlanRowChangeContext = ({
	state,
}: {
	state: SubjectState | null;
}): PlanRowChangeContext => ({
	state,
	insertedRows: { customerEntitlements: [], pooledBalances: [] },
	deletedRowKeys: new Set(),
});

export const rowKeyOf = ({ table, id }: { table: string; id: string }) =>
	`${table}:${id}`;

export const wasDeletedByPlan = ({
	context,
	table,
	id,
}: {
	context: PlanRowChangeContext;
	table: string;
	id: string;
}): boolean => context.deletedRowKeys.has(rowKeyOf({ table, id }));

export const findPlanRow = <
	Table extends keyof PlanRowChangeContext["insertedRows"],
>({
	context,
	table,
	id,
}: {
	context: PlanRowChangeContext;
	table: Table;
	id: string;
}): PlanRowChangeContext["insertedRows"][Table][number] | undefined =>
	[...(context.state?.[table] ?? []), ...context.insertedRows[table]].find(
		(row) => row.id === id,
	);

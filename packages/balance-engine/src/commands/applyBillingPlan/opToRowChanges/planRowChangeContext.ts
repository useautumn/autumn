import type { WorkerCustomerEntitlement } from "../../../models/subject/rows/workerCustomerEntitlement.js";
import type { WorkerPooledBalance } from "../../../models/subject/rows/workerPooledBalance.js";
import type { SubjectState } from "../../../models/subject/subjectState.js";

/** What converting one op needs: the rows as found before the plan, the rows its earlier ops inserted, and the rows they deleted. */
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

/** A row as the plan sees it now: held before the plan, or inserted by an earlier op of it. */
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

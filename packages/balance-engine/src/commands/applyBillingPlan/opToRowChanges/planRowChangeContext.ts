import type { SubjectState } from "../../../models/subject/subjectState.js";

/** What converting one op needs: the rows as found before the plan, and the rows its earlier ops deleted. */
export type PlanRowChangeContext = {
	state: SubjectState | null;
	deletedRowKeys: Set<string>;
};

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

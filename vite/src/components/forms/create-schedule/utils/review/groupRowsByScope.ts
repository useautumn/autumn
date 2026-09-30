import type { ReviewChangeRow } from "./types/reviewChange";

export type ReviewScopeGroup = {
	entityId: string | null;
	rows: ReviewChangeRow[];
};

/** Rows grouped by plan scope, in the order each scope first appears. */
export const groupRowsByScope = ({
	rows,
}: {
	rows: ReviewChangeRow[];
}): ReviewScopeGroup[] => {
	const groups = new Map<string | null, ReviewChangeRow[]>();
	for (const row of rows) {
		const entityId = row.entityId ?? null;
		const scopeRows = groups.get(entityId);
		if (scopeRows) {
			scopeRows.push(row);
			continue;
		}
		groups.set(entityId, [row]);
	}
	return [...groups].map(([entityId, scopeRows]) => ({
		entityId,
		rows: scopeRows,
	}));
};

export const hasScopedRows = ({ rows }: { rows: ReviewChangeRow[] }) =>
	rows.some((row) => Boolean(row.entityId));

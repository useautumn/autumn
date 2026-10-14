type ScopedRow = { entity_id?: string | null };

type ReviewScopeGroup<Row extends ScopedRow> = {
	entityId: string | null;
	rows: Row[];
};

/** Rows grouped by plan scope, in the order each scope first appears. */
export const groupRowsByScope = <Row extends ScopedRow>({
	rows,
}: {
	rows: Row[];
}): ReviewScopeGroup<Row>[] => {
	const groups = new Map<string | null, Row[]>();
	for (const row of rows) {
		const entityId = row.entity_id ?? null;
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

export const hasScopedRows = ({ rows }: { rows: ScopedRow[] }) =>
	rows.some((row) => Boolean(row.entity_id));

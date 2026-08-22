export const toPlanAliasMap = ({
	rows,
}: {
	rows: { alias_id: string; canonical_plan_id: string }[] | null | undefined;
}): Record<string, string> =>
	Object.fromEntries(
		(rows ?? []).map((row) => [row.alias_id, row.canonical_plan_id]),
	);

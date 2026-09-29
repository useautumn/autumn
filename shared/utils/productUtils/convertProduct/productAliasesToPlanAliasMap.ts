/** An org's product alias rows as the `alias_id → canonical plan id` map `org.planAliases` holds. */
export const productAliasesToPlanAliasMap = ({
	rows,
}: {
	rows: { alias_id: string; canonical_plan_id: string }[] | null | undefined;
}): Record<string, string> =>
	Object.fromEntries(
		(rows ?? []).map((row) => [row.alias_id, row.canonical_plan_id]),
	);

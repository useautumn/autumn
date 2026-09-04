/**
 * Where a pulled plan row belongs in the config. Membership carries `active`:
 * the live row goes to `plans`; a newer inactive row is a draft and also goes
 * to `plans`, written with `active: false`; older rows are history.
 */
export const routePlanRow = ({
	row,
	activeVersion,
}: {
	row: { active?: boolean; version?: number };
	activeVersion: number | undefined;
}): { collection: "plans" | "planVersions"; draft: boolean } => {
	if (row.active === true) return { collection: "plans", draft: false };
	const isNewer =
		activeVersion !== undefined &&
		typeof row.version === "number" &&
		row.version > activeVersion;
	return isNewer
		? { collection: "plans", draft: true }
		: { collection: "planVersions", draft: false };
};

/** The active row's version among all rows of one plan id, if any. */
export const activeVersionOf = ({
	rows,
}: {
	rows: { active?: boolean; version?: number }[];
}): number | undefined => rows.find((row) => row.active === true)?.version;

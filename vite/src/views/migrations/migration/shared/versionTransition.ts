import type { UpdatePlanOp } from "@autumn/shared";

const sourceVersions = (planFilter: UpdatePlanOp["plan_filter"]): number[] => {
	const version = planFilter.version;
	if (typeof version === "number") return [version];
	if (version && typeof version === "object" && "$in" in version) {
		const values = version.$in;
		return Array.isArray(values)
			? values.filter((value): value is number => typeof value === "number")
			: [];
	}
	return [];
};

/** "v2 → v3" when the op pins its source version(s), else "→ v3". */
export function formatVersionTransition({
	planFilter,
	version,
}: {
	planFilter: UpdatePlanOp["plan_filter"];
	version: number;
}): string {
	const from = sourceVersions(planFilter)
		.sort((a, b) => a - b)
		.map((value) => `v${value}`);
	return from.length > 0 ? `${from.join(", ")} → v${version}` : `→ v${version}`;
}

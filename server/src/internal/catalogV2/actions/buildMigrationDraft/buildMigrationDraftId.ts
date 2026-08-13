import type { NumberMatcher, PlanFilter, StringMatcher } from "@autumn/shared";
import { migrationUid } from "@autumn/shared";

const planIdsFromMatcher = (matcher: StringMatcher | undefined): string[] => {
	if (typeof matcher === "string") return [matcher];
	if (matcher == null || typeof matcher !== "object") return [];
	if (matcher.$in) {
		return [...matcher.$in].sort((left, right) => left.localeCompare(right));
	}
	if (typeof matcher.$eq === "string") return [matcher.$eq];
	return [];
};

const versionSegment = (version: NumberMatcher | undefined): string => {
	if (version == null) return "all";
	if (typeof version === "number") return `v${version}`;
	if (version.$in) {
		return [...version.$in]
			.sort((left, right) => left - right)
			.map((value) => `v${value}`)
			.join("-");
	}
	if (typeof version.$eq === "number") return `v${version.$eq}`;
	return "all";
};

const branchToScope = (branch: PlanFilter): string => {
	const planIds = planIdsFromMatcher(branch.plan_id);
	const versions = versionSegment(branch.version);
	if (planIds.length === 0) return `plans-${versions}`;
	return planIds.map((planId) => `${planId}-${versions}`).join("+");
};

/** Readable filter projection: `pro-v3`, `pro-all`, `premium-v3+pro-v1-v2`. */
export const planFilterToMigrationIdScope = ({
	planFilter,
}: {
	planFilter: PlanFilter;
}): string => {
	const branches = planFilter.$or ?? [planFilter];
	return branches.map(branchToScope).join("+") || "plans";
};

/** `{scope}-update-{uid}` — scope names every targeted plan and its version pin. */
export const buildMigrationDraftId = ({
	planFilter,
}: {
	planFilter: PlanFilter;
}): string =>
	`${planFilterToMigrationIdScope({ planFilter })}-update-${migrationUid()}`;

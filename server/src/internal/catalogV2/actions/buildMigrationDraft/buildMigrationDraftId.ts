import type { PlanFilter, StringMatcher } from "@autumn/shared";
import { migrationUid } from "@autumn/shared";

const planIdsFromMatcher = (matcher: StringMatcher | undefined): string[] => {
	if (typeof matcher === "string") return [matcher];
	if (matcher == null || typeof matcher !== "object") return [];
	if (matcher.$in) return [...matcher.$in];
	if (typeof matcher.$eq === "string") return [matcher.$eq];
	return [];
};

const planIdsFromFilter = ({
	planFilter,
}: {
	planFilter: PlanFilter;
}): string[] => {
	const branches = planFilter.$or ?? [planFilter];
	const ids = new Set<string>();
	for (const branch of branches) {
		for (const id of planIdsFromMatcher(branch.plan_id)) ids.add(id);
	}
	return [...ids].sort((left, right) => left.localeCompare(right));
};

/** Name at most two plans; a 6-variant $or must not become the URL. */
const MAX_NAMED_PLANS = 2;

const namedPlans = ({ planIds }: { planIds: string[] }): string => {
	if (planIds.length === 0) return "plans";
	if (planIds.length <= MAX_NAMED_PLANS) return planIds.join("-and-");
	return `${planIds[0]}-and-${planIds.length - 1}-more`;
};

/** Plan ids only: `pro`, `premium-and-pro`, `growth-and-5-more`. */
export const planFilterToMigrationIdScope = ({
	planFilter,
}: {
	planFilter: PlanFilter;
}): string => namedPlans({ planIds: planIdsFromFilter({ planFilter }) });

/** `{scope}-update-{uid}` — uid is the uniqueness; scope is a short label. */
export const buildMigrationDraftId = ({
	planFilter,
}: {
	planFilter: PlanFilter;
}): string =>
	`${planFilterToMigrationIdScope({ planFilter })}-update-${migrationUid()}`;

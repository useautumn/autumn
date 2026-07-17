import { type CatalogPlanParams, ErrCode, RecaseError } from "@autumn/shared";

const referenceKey = (id: string, version?: number) =>
	version === undefined ? id : `${id}@${version}`;

const dependenciesForPlan = (plan: CatalogPlanParams) =>
	(plan.licenses ?? []).map((license) => license.license_plan_id);

export const sortCatalogPlansByDependencies = (
	plans: CatalogPlanParams[],
): CatalogPlanParams[] => {
	const byReference = new Map<string, CatalogPlanParams>();
	for (const plan of plans) {
		byReference.set(referenceKey(plan.plan_id, plan.version), plan);
		const latestKey = plan.new_plan_id ?? plan.plan_id;
		const latest = byReference.get(latestKey);
		if (!latest || (plan.version ?? 0) > (latest.version ?? 0)) {
			byReference.set(latestKey, plan);
		}
	}

	const visiting = new Set<string>();
	const visited = new Set<string>();
	const sorted: CatalogPlanParams[] = [];
	const visit = (plan: CatalogPlanParams) => {
		const key = referenceKey(plan.plan_id, plan.version);
		if (visiting.has(key)) {
			throw new RecaseError({
				message: "Plan dependency cycle detected.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		if (visited.has(key)) return;
		visiting.add(key);
		for (const reference of dependenciesForPlan(plan)) {
			const dependency = byReference.get(reference);
			if (dependency && dependency !== plan) visit(dependency);
		}
		visiting.delete(key);
		visited.add(key);
		sorted.push(plan);
	};
	for (const plan of plans) visit(plan);
	return sorted;
};

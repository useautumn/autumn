import type {
	CustomerFilter,
	MigrationFilter,
	Operations,
	PlanFilter,
} from "@autumn/shared";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizePlanFilter(filter: PlanFilter): PlanFilter | null {
	const normalized = { ...filter };
	for (const key of Object.keys(normalized) as (keyof PlanFilter)[]) {
		if (normalized[key] === undefined) delete normalized[key];
	}
	if (normalized.plan_id === "") delete normalized.plan_id;
	return Object.keys(normalized).length > 0 ? normalized : null;
}

function extractPlanFilter(plan: CustomerFilter["plan"]): PlanFilter | null {
	if (!isRecord(plan)) return null;
	if ("$none" in plan || "$every" in plan) return null;
	if ("$some" in plan) {
		const inner = plan.$some;
		return isRecord(inner) ? normalizePlanFilter(inner as PlanFilter) : null;
	}
	return normalizePlanFilter(plan as PlanFilter);
}

function mergePlanFilters({
	inheritedPlanFilter,
	operationPlanFilter,
}: {
	inheritedPlanFilter: PlanFilter;
	operationPlanFilter: PlanFilter | null;
}): PlanFilter {
	const merged = {
		...(operationPlanFilter ?? {}),
		...inheritedPlanFilter,
	};

	return {
		...merged,
		plan_id: operationPlanFilter?.plan_id ?? inheritedPlanFilter.plan_id,
		version: operationPlanFilter?.version ?? inheritedPlanFilter.version,
		$or: operationPlanFilter?.$or ?? inheritedPlanFilter.$or,
	};
}

export function getInheritedPlanFilter(filter: MigrationFilter): PlanFilter | null {
	return extractPlanFilter(filter.customer?.plan);
}

export function inheritPlanFilterIntoOperations({
	filter,
	operations,
}: {
	filter: MigrationFilter;
	operations: Operations;
}): Operations {
	const inheritedPlanFilter = getInheritedPlanFilter(filter);
	const customerOps = operations.customer;
	if (!inheritedPlanFilter || !customerOps || customerOps.length === 0)
		return operations;

	return {
		...operations,
		customer: customerOps.map((operation) =>
			operation.type === "update_plan"
				? {
						...operation,
						plan_filter: mergePlanFilters({
							inheritedPlanFilter,
							operationPlanFilter: normalizePlanFilter(operation.plan_filter),
						}),
					}
				: operation,
		),
	};
}

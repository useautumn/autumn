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

function planProperties(filter: PlanFilter): PlanFilter {
	const properties: PlanFilter = {};
	if (filter.custom !== undefined) properties.custom = filter.custom;
	if (filter.paid !== undefined) properties.paid = filter.paid;
	if (filter.recurring !== undefined) properties.recurring = filter.recurring;
	if (filter.price !== undefined) properties.price = filter.price;
	return properties;
}

function planSelection(filter: PlanFilter): PlanFilter {
	const selection: PlanFilter = {};
	if (filter.plan_id !== undefined) selection.plan_id = filter.plan_id;
	if (filter.version !== undefined) selection.version = filter.version;
	if (filter.$or !== undefined) selection.$or = filter.$or;
	return selection;
}

function hasPlanSelection(filter: PlanFilter | null): filter is PlanFilter {
	return (
		filter != null &&
		(filter.plan_id !== undefined || filter.$or !== undefined)
	);
}

function mergePlanFilters({
	inheritedPlanFilter,
	operationPlanFilter,
}: {
	inheritedPlanFilter: PlanFilter;
	operationPlanFilter: PlanFilter | null;
}): PlanFilter {
	// An explicit operation selection replaces the inherited one wholesale —
	// mixing `plan_id` with a leftover inherited `$or` cooks the filter.
	if (!hasPlanSelection(operationPlanFilter)) return inheritedPlanFilter;
	return {
		...planProperties(inheritedPlanFilter),
		...planSelection(operationPlanFilter),
	};
}

export function getInheritedPlanFilter(
	filter: MigrationFilter,
): PlanFilter | null {
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

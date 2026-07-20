import {
	type CatalogPlanParams,
	ErrCode,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";

const referenceKey = (id: string, version?: number) =>
	version === undefined ? id : `${id}@${version}`;

const targetId = (plan: CatalogPlanParams) => plan.new_plan_id ?? plan.plan_id;

const dependenciesForPlan = (plan: CatalogPlanParams) =>
	(plan.licenses ?? []).map((license) => ({
		id: license.license_plan_id,
		version: license.version,
	}));

export const sortCatalogPlansByDependencies = (
	plans: CatalogPlanParams[],
): CatalogPlanParams[] => {
	const byReference = new Map<string, CatalogPlanParams>();
	for (const plan of plans) {
		byReference.set(referenceKey(targetId(plan), plan.version), plan);
		const latestKey = targetId(plan);
		const latest = byReference.get(latestKey);
		if (!latest || (plan.version ?? 0) > (latest.version ?? 0)) {
			byReference.set(latestKey, plan);
		}
	}

	const visiting = new Set<string>();
	const visited = new Set<string>();
	const sorted: CatalogPlanParams[] = [];
	const visit = (plan: CatalogPlanParams) => {
		const key = referenceKey(targetId(plan), plan.version);
		if (visiting.has(key)) {
			throw new RecaseError({
				message: "Plan dependency cycle detected.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		if (visited.has(key)) return;
		visiting.add(key);
		if (plan.version !== undefined && plan.version > 1) {
			const previous = byReference.get(
				referenceKey(targetId(plan), plan.version - 1),
			);
			if (previous) visit(previous);
		}
		for (const reference of dependenciesForPlan(plan)) {
			const dependency =
				byReference.get(referenceKey(reference.id, reference.version)) ??
				byReference.get(reference.id);
			if (dependency && dependency !== plan) visit(dependency);
		}
		visiting.delete(key);
		visited.add(key);
		sorted.push(plan);
	};
	for (const plan of plans) visit(plan);
	return sorted;
};

export const validateCatalogPlanVersionTargets = ({
	plans,
	products,
}: {
	plans: CatalogPlanParams[];
	products: FullProduct[];
}) => {
	const existing = new Set(
		products.map((product) => referenceKey(product.id, product.version)),
	);
	const latestById = new Map<string, number>();
	for (const product of products) {
		latestById.set(
			product.id,
			Math.max(latestById.get(product.id) ?? 0, product.version),
		);
	}

	for (const plan of sortCatalogPlansByDependencies(plans)) {
		const id = targetId(plan);
		if (
			plan.version === undefined ||
			existing.has(referenceKey(id, plan.version))
		) {
			continue;
		}
		const expected = (latestById.get(id) ?? 0) + 1;
		if (plan.version !== expected) {
			throw new RecaseError({
				message: `Plan ${id} version must be ${expected}, received ${plan.version}.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		existing.add(referenceKey(id, plan.version));
		latestById.set(id, plan.version);
	}
};

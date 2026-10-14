import {
	type Feature,
	type FullProduct,
	productKeyToString,
	productToProductKey,
} from "@autumn/shared";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { planFilterMatchesProduct } from "@autumn/shared/api/products/utils/match/index.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import { toCatalogPlanFilter } from "../scope/operationScope.js";
import { expandPlanFilterDisjuncts } from "../scope/utils/expandPlanFilterDisjuncts.js";
import type {
	BatchMigrationComputeResult,
	BatchMigrationPatch,
} from "../types/index.js";
import { computeUpdatePlanPatch } from "./computeUpdatePlanPatch.js";
import {
	checkMigrationEligibility,
	checkOverlappingPatches,
	checkUpdatePlanOpEligibility,
} from "./guards/index.js";

type UpdatePlanTarget = {
	op: UpdatePlanOp;
	opIndex: number;
	fromProduct: FullProduct;
	planFilters: PlanFilter[];
};

export const computeBatchMigration = ({
	migration,
	products,
	features,
}: {
	migration: MigrationRuntime;
	products: FullProduct[];
	features: Feature[];
}): BatchMigrationComputeResult => {
	const { rejections, updatePlanOps } = checkMigrationEligibility({
		migration,
	});
	const productsByPlanVersion = new Map<string, FullProduct>();
	for (const product of products) {
		productsByPlanVersion.set(
			productKeyToString({
				productKey: productToProductKey({ product }),
			}),
			product,
		);
	}

	const targets: UpdatePlanTarget[] = [];
	for (const { op, opIndex } of updatePlanOps) {
		const opRejections = checkUpdatePlanOpEligibility({ op, opIndex });
		if (opRejections.length > 0) {
			rejections.push(...opRejections);
			continue;
		}

		const opTargets: UpdatePlanTarget[] = expandPlanFilterDisjuncts(
			op.plan_filter,
		).flatMap((planFilters) =>
			products
				.filter((product) =>
					planFilters.every((planFilter) =>
						planFilterMatchesProduct({
							filter: toCatalogPlanFilter(planFilter),
							product,
						}),
					),
				)
				.map((fromProduct) => ({ op, opIndex, fromProduct, planFilters })),
		);
		if (opTargets.length === 0) {
			rejections.push({
				code: "no_matched_products",
				opIndex,
				message:
					"plan_filter matches no catalog product; nothing for this operation to target.",
			});
			continue;
		}

		targets.push(...opTargets);
	}

	const patches: BatchMigrationPatch[] = [];
	for (const target of targets) {
		const computed = computeUpdatePlanPatch({
			migration,
			features,
			productsByPlanVersion,
			...target,
		});
		rejections.push(...computed.rejections);
		if (computed.patch) patches.push(computed.patch);
	}

	rejections.push(...checkOverlappingPatches({ patches }));

	if (rejections.length > 0) return { computable: false, rejections };
	return { computable: true, plan: { patches } };
};

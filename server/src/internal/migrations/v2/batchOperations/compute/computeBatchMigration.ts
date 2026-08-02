import type { Feature, FullProduct } from "@autumn/shared";
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

/** One unit of batch work to compute: an op applied to one catalog product a
 * plan_filter disjunct matched, carrying that disjunct's conjunct filters. */
type UpdatePlanTarget = {
	op: UpdatePlanOp;
	opIndex: number;
	fromProduct: FullProduct;
	planFilters: PlanFilter[];
};

/**
 * Lowers a migration's ordered customer operations into uniform, set-based
 * batch patches. Pure — callers load the full catalog (every version, via
 * ProductService.listFull returnAll) and features up front.
 *
 * Conservative by construction: any op whose per-customer outcome cannot be
 * proven identical for every matched customer produces a rejection, and one
 * rejection anywhere routes the WHOLE migration to the per-customer lane
 * (all-or-nothing; no lane mixing). Rejections are collected exhaustively
 * so the fallback reason is fully auditable.
 *
 * `computable: true` with zero patches means every op is a provable no-op.
 */
export const computeBatchMigration = ({
	migration,
	products,
	features,
}: {
	migration: MigrationRuntime;
	products: FullProduct[];
	features: Feature[];
}): BatchMigrationComputeResult => {
	// 1. Migration-level gate: no_billing_changes, supported op types.
	const { rejections, updatePlanOps } = checkMigrationEligibility({
		migration,
	});

	// 2. Resolve ops to flat (op, fromProduct) targets: op-level guards,
	//    then plan_filter matched against the catalog.
	const targets: UpdatePlanTarget[] = [];
	for (const { op, opIndex } of updatePlanOps) {
		const opRejections = checkUpdatePlanOpEligibility({ op, opIndex });
		if (opRejections.length > 0) {
			rejections.push(...opRejections);
			continue;
		}

		// $or expands into disjuncts; a product matches a disjunct when EVERY
		// conjunct's catalog part matches it.
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

	// 3. Compute one patch per target.
	const patches: BatchMigrationPatch[] = [];
	for (const target of targets) {
		const computed = computeUpdatePlanPatch({ migration, features, ...target });
		rejections.push(...computed.rejections);
		if (computed.patch) patches.push(computed.patch);
	}

	// 4. Ordered ops project state — two ops touching the same product is
	//    not modeled.
	rejections.push(...checkOverlappingPatches({ patches }));

	if (rejections.length > 0) return { computable: false, rejections };
	return { computable: true, plan: { patches } };
};

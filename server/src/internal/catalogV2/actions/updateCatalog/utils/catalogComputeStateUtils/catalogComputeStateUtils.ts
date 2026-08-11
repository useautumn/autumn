import type { Feature, FullProduct } from "@autumn/shared";
import {
	type CatalogComputeState,
	type CatalogComputeStep,
	type CatalogPlanDraft,
	emptyCatalogPlanDraft,
	toUpdateCatalogPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { projectCatalog } from "./projectCatalog";

/** Replace each plan slice the step provides; leave the rest untouched. */
const mergeCatalogPlanDraft = ({
	base,
	incoming,
}: {
	base: CatalogPlanDraft;
	incoming: CatalogComputeStep;
}): CatalogPlanDraft => ({
	insertFeatures: incoming.insertFeatures ?? base.insertFeatures,
	updateFeatures: incoming.updateFeatures ?? base.updateFeatures,
	removeFeatures: incoming.removeFeatures ?? base.removeFeatures,
	upsertProducts: incoming.upsertProducts ?? base.upsertProducts,
});

/** Empty fold: projected catalog equals the frozen originals. */
export const emptyCatalogComputeState = ({
	originalFeatures,
	originalProducts,
}: {
	originalFeatures: Feature[];
	originalProducts: FullProduct[];
}): CatalogComputeState => ({
	originalFeatures,
	originalProducts,
	plan: emptyCatalogPlanDraft(),
	projected: { features: originalFeatures, products: originalProducts },
});

/**
 * Apply one compute step to the fold.
 * Rebuilds `projected` from originals + full plan (never mutates projected in place).
 */
export const advanceCatalogCompute = ({
	state,
	step,
}: {
	state: CatalogComputeState;
	step: CatalogComputeStep;
}): CatalogComputeState => {
	const plan = mergeCatalogPlanDraft({ base: state.plan, incoming: step });
	return {
		originalFeatures: state.originalFeatures,
		originalProducts: state.originalProducts,
		plan,
		projected: projectCatalog({
			originalFeatures: state.originalFeatures,
			originalProducts: state.originalProducts,
			plan,
		}),
	};
};

/**
 * Progressive compute handle for `computeUpdateCatalogPlan`.
 * Call `advance({ step })` after each compute step; finish with `toPlan()`.
 */
export const createCatalogComputeState = ({
	originalFeatures,
	originalProducts,
}: {
	originalFeatures: Feature[];
	originalProducts: FullProduct[];
}) => {
	let state = emptyCatalogComputeState({ originalFeatures, originalProducts });

	return {
		/** Catalog after all advances so far — pass into the next compute step. */
		get projected() {
			return state.projected;
		},
		/** Merge `step` into the plan and refresh `projected`. */
		advance: ({ step }: { step: CatalogComputeStep }) => {
			state = advanceCatalogCompute({ state, step });
		},
		/** Final UpdateCatalogPlan (draft slices + projected). */
		toPlan: (): UpdateCatalogPlan => toUpdateCatalogPlan({ state }),
	};
};

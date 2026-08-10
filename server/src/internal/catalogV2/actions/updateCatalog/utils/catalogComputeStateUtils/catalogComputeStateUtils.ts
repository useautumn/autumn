import type { Feature } from "@autumn/shared";
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
});

/** Empty fold: projected catalog equals the frozen original feature list. */
export const emptyCatalogComputeState = ({
	originalFeatures,
}: {
	originalFeatures: Feature[];
}): CatalogComputeState => ({
	originalFeatures,
	plan: emptyCatalogPlanDraft(),
	projected: { features: originalFeatures },
});

/**
 * Apply one compute step to the fold.
 * Rebuilds `projected` from original + full plan (never mutates projected in place).
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
		plan,
		projected: projectCatalog({
			originalFeatures: state.originalFeatures,
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
}: {
	originalFeatures: Feature[];
}) => {
	let state = emptyCatalogComputeState({ originalFeatures });

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

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
	removePlans: incoming.removePlans ?? base.removePlans,
});

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

export const createCatalogComputeState = ({
	originalFeatures,
	originalProducts,
}: {
	originalFeatures: Feature[];
	originalProducts: FullProduct[];
}) => {
	let state = emptyCatalogComputeState({ originalFeatures, originalProducts });

	return {
		get projected() {
			return state.projected;
		},
		get plan() {
			return state.plan;
		},
		advance: ({ step }: { step: CatalogComputeStep }) => {
			state = advanceCatalogCompute({ state, step });
		},
		toPlan: (): UpdateCatalogPlan => toUpdateCatalogPlan({ state }),
	};
};

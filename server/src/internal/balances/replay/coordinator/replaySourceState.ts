import {
	type CatalogRow,
	catalogRowsToCatalog,
	parseSubjectState,
	type SubjectState,
} from "@autumn/balance-engine";
import { ReplayHydrationSourceMismatchError } from "../replayHydrationErrors.js";
import {
	identitiesEqual,
	type NormalizedSelection,
} from "./replaySelection.js";

/** Rows name features by internal id; the catalog rows that came with them map back to public ids. */
const featureIdsOf = ({
	state,
	catalogRows,
}: {
	state: SubjectState;
	catalogRows: CatalogRow[];
}): string[] => {
	const { features } = catalogRowsToCatalog({ rows: catalogRows });
	return [
		...new Set(
			state.customerEntitlements.map(
				({ internal_feature_id }) =>
					features[internal_feature_id]?.id ?? internal_feature_id,
			),
		),
	].sort();
};

export function validateSourceState({
	input,
	catalogRows,
	selection,
}: {
	input: SubjectState;
	catalogRows: CatalogRow[];
	selection: NormalizedSelection;
}): SubjectState {
	let state: SubjectState;
	try {
		state = parseSubjectState({ input });
	} catch (cause) {
		throw new ReplayHydrationSourceMismatchError({
			reason: cause instanceof Error ? cause.message : "invalid_state",
		});
	}
	if (!identitiesEqual({ left: state.identity, right: selection.identity })) {
		throw new ReplayHydrationSourceMismatchError({ reason: "identity" });
	}
	const actualFeatureIds = featureIdsOf({ state, catalogRows });
	if (
		actualFeatureIds.length !== selection.featureIds.length ||
		actualFeatureIds.some(
			(featureId, index) => featureId !== selection.featureIds[index],
		)
	) {
		throw new ReplayHydrationSourceMismatchError({ reason: "feature_set" });
	}
	return state;
}

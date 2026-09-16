import {
	type CustomerMeteringState,
	parseCustomerMeteringState,
} from "@autumn/balance-engine";
import { ReplayHydrationSourceMismatchError } from "../replayHydrationErrors.js";
import {
	identitiesEqual,
	type NormalizedSelection,
} from "./replaySelection.js";

export function validateSourceState({
	input,
	selection,
}: {
	input: CustomerMeteringState;
	selection: NormalizedSelection;
}): CustomerMeteringState {
	let state: CustomerMeteringState;
	try {
		state = parseCustomerMeteringState({ input });
	} catch (cause) {
		throw new ReplayHydrationSourceMismatchError({
			reason: cause instanceof Error ? cause.message : "invalid_state",
		});
	}
	if (!identitiesEqual({ left: state.identity, right: selection.identity })) {
		throw new ReplayHydrationSourceMismatchError({ reason: "identity" });
	}
	const actualFeatureIds = Object.keys(state.featureStatesById).sort();
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

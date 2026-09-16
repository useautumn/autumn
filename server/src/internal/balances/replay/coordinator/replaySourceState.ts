import { type CustomerState, parseCustomerState } from "@autumn/balance-engine";
import { ReplayHydrationSourceMismatchError } from "../replayHydrationErrors.js";
import {
	identitiesEqual,
	type NormalizedSelection,
} from "./replaySelection.js";

const featureIdsOf = ({ state }: { state: CustomerState }): string[] =>
	[
		...new Set(
			Object.values(state.customerEntitlements).map(
				({ featureId }) => featureId,
			),
		),
	].sort();

export function validateSourceState({
	input,
	selection,
}: {
	input: CustomerState;
	selection: NormalizedSelection;
}): CustomerState {
	let state: CustomerState;
	try {
		state = parseCustomerState({ input });
	} catch (cause) {
		throw new ReplayHydrationSourceMismatchError({
			reason: cause instanceof Error ? cause.message : "invalid_state",
		});
	}
	if (!identitiesEqual({ left: state.identity, right: selection.identity })) {
		throw new ReplayHydrationSourceMismatchError({ reason: "identity" });
	}
	const actualFeatureIds = featureIdsOf({ state });
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

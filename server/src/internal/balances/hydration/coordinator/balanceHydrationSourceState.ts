import {
	type CustomerMeteringState,
	parseCustomerMeteringState,
} from "@autumn/balance-engine";
import { BalanceHydrationSourceMismatchError } from "../balanceHydrationErrors.js";
import {
	identitiesEqual,
	type NormalizedSelection,
} from "./balanceHydrationSelection.js";

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
		throw new BalanceHydrationSourceMismatchError({
			reason: cause instanceof Error ? cause.message : "invalid_state",
		});
	}
	if (!identitiesEqual({ left: state.identity, right: selection.identity })) {
		throw new BalanceHydrationSourceMismatchError({ reason: "identity" });
	}
	const actualFeatureIds = Object.keys(state.featureStatesById).sort();
	if (
		actualFeatureIds.length !== selection.featureIds.length ||
		actualFeatureIds.some(
			(featureId, index) => featureId !== selection.featureIds[index],
		)
	) {
		throw new BalanceHydrationSourceMismatchError({ reason: "feature_set" });
	}
	return state;
}

import {
	type ApiCustomerV5,
	type ApiEntityV2,
	apiBalanceToAllowed,
	type Feature,
} from "../../../../../index";

export const getFeatureToUseForCheck = ({
	creditSystems,
	feature,
	apiSubject,
	requiredBalance,
}: {
	creditSystems: Feature[];
	feature: Feature;
	apiSubject: ApiCustomerV5 | ApiEntityV2;
	requiredBalance: number;
}) => {
	// 1. If there's a credit system & cusEnts for that credit system -> return credit system
	// 2. If there's cusEnts for the feature -> return feature
	// 3. Otherwise, feature to use is credit system if exists, otherwise return feature
	if (creditSystems.length === 0) return feature;

	const mainBalance = apiSubject.balances?.[feature.id];

	if (
		mainBalance &&
		apiBalanceToAllowed({
			apiBalance: mainBalance,
			apiSubject,
			feature,
			requiredBalance,
		}).allowed
	) {
		return feature;
	}

	for (const creditSystem of creditSystems) {
		const apiBalance = apiSubject.balances?.[creditSystem.id];
		if (!apiBalance) continue;

		if (
			apiBalanceToAllowed({
				apiBalance,
				apiSubject,
				feature: creditSystem,
				requiredBalance,
			}).allowed
		) {
			return creditSystem;
		}
	}

	return creditSystems[0];
};

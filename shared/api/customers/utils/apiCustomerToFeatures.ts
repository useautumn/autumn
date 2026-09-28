import type { ApiFeatureV1 } from "../../features/apiFeatureV1";
import type { ApiCustomerV5 } from "../apiCustomerV5";

export const apiCustomerToFeatures = ({
	apiCustomer,
}: {
	apiCustomer: ApiCustomerV5;
}): ApiFeatureV1[] => {
	const balances = Object.values(apiCustomer.balances);
	const flags = Object.values(apiCustomer.flags);
	const subjectStates = [...balances, ...flags];
	if (subjectStates.length === 0) return [];

	const firstSubjectState = subjectStates[0];
	if (!firstSubjectState.feature) {
		throw new Error(
			"[apiCustomerToFeatures] please expand `balances.feature` or `flags.feature` to get features for the customer",
		);
	}

	return subjectStates
		.map((subjectState) => subjectState.feature)
		.filter((feature): feature is ApiFeatureV1 => feature !== undefined);
};

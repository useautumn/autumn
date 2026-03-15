import type { ApiFeatureV1 } from "../../features/apiFeatureV1";
import type { ApiCustomerV5 } from "../apiCustomerV5";

export const apiCustomerToFeatures = ({
	apiCustomer,
}: {
	apiCustomer: ApiCustomerV5;
}): ApiFeatureV1[] => {
	const balances = Object.values(apiCustomer.balances);
	const flags = Object.values(apiCustomer.flags);
	const customerStates = [...balances, ...flags];
	if (customerStates.length === 0) return [];

	const firstCustomerState = customerStates[0];
	if (!firstCustomerState.feature) {
		throw new Error(
			"[apiCustomerToFeatures] please expand `balances.feature` or `flags.feature` to get features for the customer",
		);
	}

	return customerStates
		.map((customerState) => customerState.feature)
		.filter((feature): feature is ApiFeatureV1 => feature !== undefined);
};

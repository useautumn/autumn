import type { ApiFeatureV1 } from "../../features/apiFeatureV1";
import type { ApiCustomerV5 } from "../apiCustomerV5";

export const apiCustomerToFeatures = ({
	apiCustomer,
}: {
	apiCustomer: ApiCustomerV5;
}): ApiFeatureV1[] => {
	const balances = Object.values(apiCustomer.balances);
	if (balances.length === 0) return [];

	const firstBalance = balances[0];
	if (!firstBalance.feature) {
		throw new Error(
			"[apiCustomerToFeatures] please expand `balances.feature` to get features for the customer",
		);
	}

	return Object.values(apiCustomer.balances)
		.map((balance) => balance.feature)
		.filter((feature): feature is ApiFeatureV1 => feature !== undefined);
};

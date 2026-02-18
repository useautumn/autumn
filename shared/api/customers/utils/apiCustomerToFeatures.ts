type ApiCustomerFeatureInput = {
	id: string;
	name?: string;
	type?: string;
	credit_schema?: Array<{
		metered_feature_id: string;
		credit_cost: number;
	}>;
	creditSchema?: Array<{
		meteredFeatureId: string;
		creditCost: number;
	}>;
};

type ApiCustomerBalanceInput = {
	feature?: ApiCustomerFeatureInput;
};

export type ApiCustomerWithBalancesInput = {
	balances: Record<string, ApiCustomerBalanceInput>;
};

export const apiCustomerToFeatures = ({
	apiCustomer,
}: {
	apiCustomer: ApiCustomerWithBalancesInput;
}) => {
	const balances = Object.values(apiCustomer.balances);
	if (balances.length === 0) return [];

	const firstBalance = balances[0];
	if (!firstBalance.feature) {
		throw new Error(
			"[customerToFeatures] please expand `balances.feature` to get features for the customer",
		);
	}

	return Object.values(apiCustomer.balances).map((balance) => {
		return balance.feature;
	}) as ApiCustomerFeatureInput[]; // safe to cast because we checked for feature in the first balance
};

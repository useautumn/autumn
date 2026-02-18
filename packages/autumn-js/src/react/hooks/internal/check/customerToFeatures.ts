import type { Customer } from "@useautumn/sdk";

type CustomerFeature = NonNullable<Customer["balances"][string]["feature"]>;

export const customerToFeatures = ({
	customer,
}: {
	customer: Customer;
}): CustomerFeature[] => {
	const balances = Object.values(customer.balances);
	if (balances.length === 0) return [];

	const firstBalance = balances[0];
	if (!firstBalance.feature) {
		throw new Error(
			"[customerToFeatures] please expand `balances.feature` to get features for the customer",
		);
	}

	return balances
		.map((balance) => balance.feature)
		.filter((feature): feature is CustomerFeature => Boolean(feature));
};

import type { Customer } from "@useautumn/sdk";

type CustomerFeature = NonNullable<Customer["balances"][string]["feature"]>;

export const customerToFeatures = ({
	customer,
}: {
	customer: Customer;
}): CustomerFeature[] => {
	const balances = Object.values(customer.balances);
	const flags = Object.values(customer.flags);
	const customerStates = [...balances, ...flags];
	if (customerStates.length === 0) return [];

	const firstCustomerState = customerStates[0];
	if (!firstCustomerState.feature) {
		throw new Error(
			"[customerToFeatures] please expand `balances.feature` or `flags.feature` to get features for the customer",
		);
	}

	return customerStates
		.map((customerState) => customerState.feature)
		.filter((feature): feature is CustomerFeature => Boolean(feature));
};

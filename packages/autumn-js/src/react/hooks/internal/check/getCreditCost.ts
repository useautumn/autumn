import type { Customer } from "@useautumn/sdk";

type CustomerFeature = NonNullable<Customer["balances"][string]["feature"]>;

export const getCreditCost = ({
	featureId,
	creditSystem,
	amount = 1,
}: {
	featureId: string;
	creditSystem: CustomerFeature;
	amount?: number;
}) => {
	if (creditSystem.type !== "credit_system") {
		return amount;
	}

	const schemaItem = creditSystem.creditSchema?.find(
		(schema) => schema.meteredFeatureId === featureId,
	);

	return amount * (schemaItem?.creditCost ?? 1);
};

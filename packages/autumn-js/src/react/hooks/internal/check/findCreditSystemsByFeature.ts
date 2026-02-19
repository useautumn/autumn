import type { Customer } from "@useautumn/sdk";

type CustomerFeature = NonNullable<Customer["balances"][string]["feature"]>;

export const findCreditSystemsByFeature = ({
	featureId,
	features,
}: {
	featureId: string;
	features: CustomerFeature[];
}) => {
	return features.filter(
		(feature) =>
			feature.id !== featureId &&
			feature.type === "credit_system" &&
			feature.creditSchema?.some(
				(schema) => schema.meteredFeatureId === featureId,
			),
	);
};

import type { ApiFeatureV1 } from "@api/features/apiFeatureV1";

export const findCreditSystemsByFeatureId = ({
	featureId,
	creditSystems,
}: {
	featureId: string;
	creditSystems: ApiFeatureV1[];
}) => {
	return creditSystems.filter((creditSystem) =>
		creditSystem.credit_schema?.some(
			(schema) => schema.metered_feature_id === featureId,
		),
	);
};

import { useGeneralQuery } from "@/hooks/queries/useGeneralQuery";

export const useHasEntityFeatureId = () => {
	const { data, isLoading } = useGeneralQuery({
		url: "/products/has_entity_feature_id",
		queryKey: ["has_entity_feature_id"],
		method: "GET",
	});

	return {
		// hasEntityFeatureId: data?.hasEntityFeatureId ?? false,
		hasEntityFeatureId: true,
		isLoading,
	};
};

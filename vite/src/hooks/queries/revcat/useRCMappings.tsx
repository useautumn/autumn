import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type RCFeatureQuantity = { feature_id: string; quantity?: number };
export type RCFeatureQuantities = Record<string, RCFeatureQuantity[]>;

interface RCMapping {
	org_id: string;
	env: string;
	autumn_product_id: string;
	revenuecat_product_ids: string[];
	feature_quantities?: RCFeatureQuantities | null;
}

interface SaveMappingInput {
	autumn_product_id: string;
	revenuecat_product_ids: string[];
	feature_quantities?: RCFeatureQuantities | null;
}

export const useRCMappings = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	const { data: mappings = [], isLoading } = useQuery({
		queryKey: buildKey(["revenuecat-mappings"]),
		queryFn: async () => {
			const { data } = await axiosInstance.get<{ mappings: RCMapping[] }>(
				"/v1/organization/revenuecat/mappings",
			);
			return data.mappings;
		},
	});

	const saveMutation = useMutation({
		mutationFn: async (mappingsToSave: SaveMappingInput[]) => {
			const { data } = await axiosInstance.post<{ mappings: RCMapping[] }>(
				"/v1/organization/revenuecat/mappings",
				{ mappings: mappingsToSave },
			);
			return data.mappings;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["revenuecat-mappings"] });
			toast.success("Mappings saved successfully");
		},
		onError: () => {
			toast.error("Failed to save mappings");
		},
	});

	return {
		mappings,
		isLoading,
		saveMappings: saveMutation.mutateAsync,
		isSaving: saveMutation.isPending,
	};
};

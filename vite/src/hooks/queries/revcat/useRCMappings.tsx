import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";

interface RCMapping {
	org_id: string;
	env: string;
	autumn_product_id: string;
	revenuecat_product_ids: string[];
}

interface SaveMappingInput {
	autumn_product_id: string;
	revenuecat_product_ids: string[];
}

export const useRCMappings = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const { data: mappings = [], isLoading } = useQuery({
		queryKey: ["revenuecat-mappings"],
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

import type { UpdateCatalogParamsInput } from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { CatalogV2Service } from "@/services/CatalogV2Service";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

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

	// Writes go through catalogV2 so the catalog is the single writer and an RC
	// id already claimed by another plan is rejected rather than silently shared.
	const toCatalogParams = (
		mappingsToSave: SaveMappingInput[],
	): UpdateCatalogParamsInput => ({
		plans: mappingsToSave.map((mapping) => ({
			plan_id: mapping.autumn_product_id,
			processors: {
				revenuecat: {
					products: mapping.revenuecat_product_ids.map((productId) => {
						const quantities = mapping.feature_quantities?.[productId];
						return {
							product_id: productId,
							...(quantities?.length ? { feature_quantities: quantities } : {}),
						};
					}),
				},
			},
		})),
	});

	const saveMutation = useMutation({
		mutationFn: (mappingsToSave: SaveMappingInput[]) =>
			CatalogV2Service.update(axiosInstance, toCatalogParams(mappingsToSave)),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["revenuecat-mappings"] }),
				queryClient.invalidateQueries({ queryKey: ["products"] }),
			]);
			toast.success("Mappings saved successfully");
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save mappings"));
		},
	});

	return {
		mappings,
		isLoading,
		saveMappings: saveMutation.mutateAsync,
		isSaving: saveMutation.isPending,
	};
};

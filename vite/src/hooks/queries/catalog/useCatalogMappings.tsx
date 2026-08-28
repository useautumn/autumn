import type {
	CatalogGetMappingsResponse,
	UpdateCatalogParamsInput,
} from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { CatalogV2Service } from "@/services/CatalogV2Service";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

const catalogMappingsBaseKey = ["catalog-mappings"] as const;

export const useCatalogMappings = ({
	enabled = true,
}: {
	enabled?: boolean;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();
	const queryKey = buildKey(catalogMappingsBaseKey);

	const mappingsQuery = useQuery({
		queryKey,
		enabled,
		queryFn: async () => {
			const { data } = await axiosInstance.post<CatalogGetMappingsResponse>(
					"/v1/catalog.get_mappings",
					{
						processor_type: "stripe",
					},
				);
			return data;
		},
	});

	// Writes go through catalogV2 so the server fans the product out to every
	// version and variant, and moves the base prices that were left behind.
	const updateMappings = useMutation({
		mutationFn: (params: UpdateCatalogParamsInput) =>
			CatalogV2Service.update(axiosInstance, params),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey }),
				queryClient.invalidateQueries({ queryKey: ["products"] }),
				queryClient.invalidateQueries({ queryKey: ["product"] }),
			]);
			toast.success("Stripe product mapping saved");
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save mapping"));
		},
	});

	return {
		mappings: mappingsQuery.data,
		isLoading: mappingsQuery.isLoading,
		isFetching: mappingsQuery.isFetching,
		error: mappingsQuery.error,
		updateMappings: updateMappings.mutateAsync,
		isSaving: updateMappings.isPending,
	};
};

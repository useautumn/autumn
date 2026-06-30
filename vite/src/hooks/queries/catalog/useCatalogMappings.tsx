import type {
	CatalogGetMappingsResponse,
	CatalogUpdateMappingsParams,
} from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
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

	const updateMappings = useMutation({
		mutationFn: async (params: CatalogUpdateMappingsParams) => {
			const { data } = await axiosInstance.post<CatalogGetMappingsResponse>(
				"/v1/catalog.update_mappings",
				params,
			);
			return data;
		},
		onSuccess: (data) => {
			queryClient.setQueryData(queryKey, data);
			queryClient.invalidateQueries({ queryKey: ["products"] });
			toast.success("Stripe product mappings saved");
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save mappings"));
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

import type {
	PreviewUpdateCatalogResponse,
	UpdateCatalogParamsInput,
} from "@autumn/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CatalogV2Service } from "@/services/CatalogV2Service";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const catalogPreviewKey = (params: UpdateCatalogParamsInput | null) =>
	["catalog-v2-preview", params] as const;

export function usePreviewUpdateCatalog({
	params,
	enabled,
}: {
	params: UpdateCatalogParamsInput | null;
	enabled: boolean;
}) {
	const axiosInstance = useAxiosInstance();

	return useQuery<PreviewUpdateCatalogResponse>({
		queryKey: catalogPreviewKey(params),
		queryFn: () =>
			CatalogV2Service.previewUpdate(
				axiosInstance,
				params as UpdateCatalogParamsInput,
			),
		enabled: enabled && !!params,
		staleTime: 0,
		retry: false,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
}

export function useFetchPreviewUpdateCatalog() {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	return (params: UpdateCatalogParamsInput) =>
		queryClient.fetchQuery({
			queryKey: catalogPreviewKey(params),
			queryFn: () => CatalogV2Service.previewUpdate(axiosInstance, params),
			retry: false,
		});
}

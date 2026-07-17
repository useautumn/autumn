import type {
	PlanUpdatePreview,
	PreviewUpdatePlanParamsV2Input,
} from "@autumn/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const planUpdatePreviewKey = (
	planId: string,
	params: PreviewUpdatePlanParamsV2Input | null,
) => ["plan-update-preview", planId, params] as const;

export function usePlanUpdatePreview({
	planId,
	params,
	enabled,
}: {
	planId: string;
	params: PreviewUpdatePlanParamsV2Input | null;
	enabled: boolean;
}) {
	const axiosInstance = useAxiosInstance();

	return useQuery<PlanUpdatePreview>({
		queryKey: planUpdatePreviewKey(planId, params),
		queryFn: () =>
			ProductService.previewUpdate(
				axiosInstance,
				params as PreviewUpdatePlanParamsV2Input,
			),
		enabled: enabled && !!planId && !!params,
		staleTime: 0,
		retry: false,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
}

export function useFetchPlanUpdatePreview() {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	return ({
		planId,
		params,
	}: {
		planId: string;
		params: PreviewUpdatePlanParamsV2Input;
	}) =>
		queryClient.fetchQuery({
			queryKey: planUpdatePreviewKey(planId, params),
			queryFn: () => ProductService.previewUpdate(axiosInstance, params),
			retry: false,
		});
}

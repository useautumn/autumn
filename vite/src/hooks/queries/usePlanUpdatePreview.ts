import type {
	PlanUpdatePreview,
	PreviewUpdatePlanParamsV2Input,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

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
		queryKey: ["plan-update-preview", planId, params],
		queryFn: () =>
			ProductService.previewUpdate(
				axiosInstance,
				params as PreviewUpdatePlanParamsV2Input,
			),
		enabled: enabled && !!planId && !!params,
		staleTime: 0,
	});
}

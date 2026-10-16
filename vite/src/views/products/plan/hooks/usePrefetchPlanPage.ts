import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { PlanEditorRoute } from "@/app/routeChunks";
import { useProductDataQueryOptions } from "../../product/hooks/useProductDataQueryOptions";

/** Warms the plan page's route chunk and data before the page mounts. */
export const usePrefetchPlanPage = () => {
	const queryClient = useQueryClient();
	const productDataQueryOptions = useProductDataQueryOptions();

	return useCallback(
		({ id, version }: { id: string; version?: number | null }) => {
			PlanEditorRoute.preload();
			void queryClient.prefetchQuery(
				productDataQueryOptions({ productId: id, version }),
			);
		},
		[queryClient, productDataQueryOptions],
	);
};

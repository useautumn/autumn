import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useProductDataQueryOptions } from "../../product/hooks/useProductDataQueryOptions";
import { loadPlanEditorView } from "../loadPlanEditorView";

/** Warms the plan page's route chunk and data before the page mounts. */
export const usePrefetchPlanPage = () => {
	const queryClient = useQueryClient();
	const productDataQueryOptions = useProductDataQueryOptions();

	return useCallback(
		({ id, version }: { id: string; version?: number | null }) => {
			void loadPlanEditorView();
			void queryClient.prefetchQuery(
				productDataQueryOptions({ productId: id, version }),
			);
		},
		[queryClient, productDataQueryOptions],
	);
};

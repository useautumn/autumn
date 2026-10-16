import { useQuery } from "@tanstack/react-query";
import {
	type PlanVariant,
	ProductService,
} from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export function usePlanVariants(planId: string, enabled: boolean) {
	const axiosInstance = useAxiosInstance();

	return useQuery<PlanVariant[]>({
		queryKey: ["plan-variants", planId],
		queryFn: async () => {
			const { variants } = await ProductService.listVariants(
				axiosInstance,
				planId,
			);
			return variants;
		},
		enabled: enabled && !!planId,
		staleTime: 0,
	});
}

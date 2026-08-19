import type { UpdateCatalogParamsInput } from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CatalogV2Service } from "@/services/CatalogV2Service";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useUpdateCatalogMutation = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (params: UpdateCatalogParamsInput) =>
			CatalogV2Service.update(axiosInstance, params),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["features"] }),
				queryClient.invalidateQueries({ queryKey: ["products"] }),
			]);
		},
	});
};

import type { ModelsDevProvider } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useModelsDevPricing = () => {
	const axiosInstance = useAxiosInstance();

	const { data, isLoading, error } = useQuery({
		queryKey: ["models-dev-pricing"],
		queryFn: async () => {
			const { data } = await axiosInstance.get<
				Record<string, ModelsDevProvider>
			>("/v1/features/ai/model_pricing");
			return data;
		},
		staleTime: 1000 * 60 * 10,
	});

	return {
		providers: data ?? {},
		isLoading,
		error,
	};
};

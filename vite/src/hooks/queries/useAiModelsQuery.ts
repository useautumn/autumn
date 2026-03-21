import type { ModelsDevProvider } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";

const getModelsDevPricing = async () => {
	try {
		const response = await fetch("https://models.dev/api.json");
		if (!response.ok) throw new Error("Failed to fetch models.dev pricing");

		const data: Record<string, ModelsDevProvider> = await response.json();
		return data;
	} catch {
		throw new Error(
			"Failed to fetch models.dev pricing and no cache available",
		);
	}
};

export const useModelsDevPricing = () => {
	const { data, isLoading, error } = useQuery({
		queryKey: ["models-dev-pricing"],
		queryFn: getModelsDevPricing,
		staleTime: 1000 * 60 * 10, // cache for 10 minutes
	});

	return {
		providers: data ?? {},
		isLoading,
		error,
	};
};

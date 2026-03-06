import { useQuery } from "@tanstack/react-query";

export type OpenRouterModel = {
	id: string;
	name: string;
	pricing: {
		prompt: string;
		completion: string;
	};
	created_at: number;
};

type OpenRouterResponse = {
	data: OpenRouterModel[];
};

const fetchOpenRouterModels = async (): Promise<OpenRouterModel[]> => {
	const response = await fetch("https://openrouter.ai/api/v1/models");
	if (!response.ok) throw new Error("Failed to fetch OpenRouter models");
	const json: OpenRouterResponse = await response.json();
	return json.data ?? [];
};

export function useOpenRouterModels() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["openrouter-models"],
		queryFn: fetchOpenRouterModels,
		staleTime: 1000 * 60 * 10, // cache for 10 minutes
	});

	return {
		models: data ?? [],
		isLoading,
		error,
	};
}

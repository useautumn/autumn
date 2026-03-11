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

export interface ModelsDevModel {
	id: string;
	name: string;
	cost: {
		input: number;
		output: number;
	};
}

export interface ModelsDevProvider {
	id: string;
	name: string;
	models: Record<string, ModelsDevModel>;
}

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

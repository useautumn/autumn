export const PROVIDER_SEPARATOR = "/";

export const CUSTOM_PROVIDER = "custom";

export const splitModelId = (
	id: string,
): { provider: string | undefined; modelKey: string } => {
	const index = id.indexOf(PROVIDER_SEPARATOR);
	if (index === -1) {
		return { provider: undefined, modelKey: id };
	}
	return {
		provider: id.slice(0, index),
		modelKey: id.slice(index + PROVIDER_SEPARATOR.length),
	};
};

export const joinModelId = (provider: string, modelKey: string): string =>
	`${provider}${PROVIDER_SEPARATOR}${modelKey}`;

export const isCustomModel = (id: string): boolean =>
	id.startsWith(`${CUSTOM_PROVIDER}${PROVIDER_SEPARATOR}`);

export interface ModelsDevCostTier {
	input: number;
	output: number;
	cache_read?: number;
	cache_write?: number;
	input_audio?: number;
	reasoning?: number;
	tier: { type: string; size: number };
}

export interface ModelsDevCost {
	input: number;
	output: number;
	cache_read?: number;
	cache_write?: number;
	input_audio?: number;
	output_audio?: number;
	reasoning?: number;
	tiers?: ModelsDevCostTier[];
	context_over_200k?: {
		input: number;
		output: number;
		cache_read?: number;
		cache_write?: number;
	};
}

export interface ModelsDevModel {
	id: string;
	name: string;
	release_date?: string;
	cost: ModelsDevCost;
}

export interface ModelsDevProvider {
	id: string;
	name: string;
	models: Record<string, ModelsDevModel>;
}

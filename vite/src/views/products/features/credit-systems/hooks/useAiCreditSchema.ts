import type { CreateFeature } from "@autumn/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useModelsDevPricing } from "@/hooks/queries/useAiModelsQuery";

type ModelMarkupEntry = {
	markup: number;
	humanModelName?: string;
	input_cost?: number;
	output_cost?: number;
};

type ModelMarkups = Record<string, ModelMarkupEntry>;

function groupByProvider(modelMarkups: ModelMarkups) {
	const groups: Record<string, string[]> = {};
	for (const fullId of Object.keys(modelMarkups)) {
		const [providerKey] = fullId.split("/");
		if (!groups[providerKey]) groups[providerKey] = [];
		groups[providerKey].push(fullId);
	}
	return groups;
}

export function useAiCreditSchema({
	creditSystem,
	setCreditSystem,
}: {
	creditSystem: CreateFeature;
	setCreditSystem: (
		creditSystem: CreateFeature | ((prev: CreateFeature) => CreateFeature),
	) => void;
}) {
	const {
		providers,
		isLoading: modelsLoading,
		error: modelsError,
	} = useModelsDevPricing();

	const modelMarkups = creditSystem.model_markups ?? {};

	const [defaultMarkup, setDefaultMarkup] = useState<number>(0);
	const manuallyEditedModels = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (modelsError) {
			toast.error("Models.dev pricing is unavailable. Try again later.");
		}
	}, [modelsError]);

	const providerGroups = useMemo(
		() => groupByProvider(modelMarkups),
		[modelMarkups],
	);
	const activeProviderKeys = Object.keys(providerGroups);

	const availableProviders = useMemo(() => {
		const filtered = Object.values(providers).filter(
			(provider) => !activeProviderKeys.includes(provider.id),
		);
		if (!activeProviderKeys.includes("custom")) {
			filtered.push({ id: "custom", name: "Custom", models: {} });
		}
		return filtered;
	}, [providers, activeProviderKeys]);

	const updateMarkups = useCallback(
		(updatedMarkups: ModelMarkups) => {
			setCreditSystem((prev) => ({
				...prev,
				model_markups: updatedMarkups,
			}));
		},
		[setCreditSystem],
	);

	const handleModelChange = useCallback(
		(providerKey: string, oldModelKey: string, newModelKey: string) => {
			const oldFullId = `${providerKey}/${oldModelKey}`;
			const newFullId = `${providerKey}/${newModelKey}`;
			if (oldFullId !== newFullId && newFullId in modelMarkups) return;
			const updatedMarkups = { ...modelMarkups };
			const oldEntry = updatedMarkups[oldFullId];
			const markup = oldEntry?.markup ?? 0;

			if (manuallyEditedModels.current.has(oldFullId)) {
				manuallyEditedModels.current.delete(oldFullId);
				manuallyEditedModels.current.add(newFullId);
			}

			delete updatedMarkups[oldFullId];
			if (providerKey === "custom") {
				updatedMarkups[newFullId] = {
					markup,
					input_cost: oldEntry?.input_cost ?? 0,
					output_cost: oldEntry?.output_cost ?? 0,
				};
			} else {
				const newModel = providers[providerKey]?.models[newModelKey];
				updatedMarkups[newFullId] = { markup, humanModelName: newModel?.name };
			}
			updateMarkups(updatedMarkups);
		},
		[modelMarkups, providers, updateMarkups],
	);

	const handleMarkupChange = useCallback(
		(providerKey: string, modelKey: string, markup: number) => {
			const fullId = `${providerKey}/${modelKey}`;
			manuallyEditedModels.current.add(fullId);
			updateMarkups({
				...modelMarkups,
				[fullId]: { ...modelMarkups[fullId], markup },
			});
		},
		[modelMarkups, updateMarkups],
	);

	const handleDefaultMarkupChange = useCallback(
		(value: number) => {
			setDefaultMarkup(value);
			const updatedMarkups = { ...modelMarkups };
			for (const modelId of Object.keys(updatedMarkups)) {
				if (!manuallyEditedModels.current.has(modelId)) {
					updatedMarkups[modelId] = {
						...updatedMarkups[modelId],
						markup: value,
					};
				}
			}
			updateMarkups(updatedMarkups);
		},
		[modelMarkups, updateMarkups],
	);

	const handleCostChange = useCallback(
		(
			providerKey: string,
			modelKey: string,
			field: "input_cost" | "output_cost",
			value: number,
		) => {
			const fullId = `${providerKey}/${modelKey}`;
			updateMarkups({
				...modelMarkups,
				[fullId]: { ...modelMarkups[fullId], [field]: value },
			});
		},
		[modelMarkups, updateMarkups],
	);

	const handleRemoveModel = useCallback(
		(providerKey: string, modelKey: string) => {
			const fullId = `${providerKey}/${modelKey}`;
			manuallyEditedModels.current.delete(fullId);
			const updatedMarkups = { ...modelMarkups };
			delete updatedMarkups[fullId];
			updateMarkups(updatedMarkups);
		},
		[modelMarkups, updateMarkups],
	);

	const handleRemoveProvider = useCallback(
		(providerKey: string) => {
			const updatedMarkups = { ...modelMarkups };
			for (const fullId of providerGroups[providerKey] ?? []) {
				manuallyEditedModels.current.delete(fullId);
				delete updatedMarkups[fullId];
			}
			updateMarkups(updatedMarkups);
		},
		[modelMarkups, providerGroups, updateMarkups],
	);

	const addProvider = useCallback(
		(providerKey: string) => {
			if (providerKey === "custom") {
				const existingKeys = (providerGroups.custom ?? []).map((fullId) => {
					const [, ...parts] = fullId.split("/");
					return parts.join("/");
				});
				let counter = 1;
				while (existingKeys.includes(`model-${counter}`)) counter++;
				updateMarkups({
					...modelMarkups,
					[`custom/model-${counter}`]: {
						markup: defaultMarkup,
						input_cost: 0,
						output_cost: 0,
					},
				});
				return;
			}
			const provider = providers[providerKey];
			if (!provider) return;
			const firstModelKey = Object.keys(provider.models)[0];
			if (!firstModelKey) return;
			const fullId = `${providerKey}/${firstModelKey}`;
			const model = provider.models[firstModelKey];
			updateMarkups({
				...modelMarkups,
				[fullId]: { markup: defaultMarkup, humanModelName: model?.name },
			});
		},
		[defaultMarkup, modelMarkups, providerGroups, providers, updateMarkups],
	);

	const addModelToProvider = useCallback(
		(providerKey: string) => {
			if (providerKey === "custom") {
				const existingKeys = (providerGroups.custom ?? []).map((fullId) => {
					const [, ...parts] = fullId.split("/");
					return parts.join("/");
				});
				let counter = 1;
				while (existingKeys.includes(`model-${counter}`)) counter++;
				const fullId = `custom/model-${counter}`;
				updateMarkups({
					...modelMarkups,
					[fullId]: { markup: defaultMarkup, input_cost: 0, output_cost: 0 },
				});
				return;
			}
			const provider = providers[providerKey];
			if (!provider) return;
			const usedModelKeys = new Set(
				(providerGroups[providerKey] ?? []).map((fullId) => {
					const [, ...parts] = fullId.split("/");
					return parts.join("/");
				}),
			);
			const nextModelKey = Object.keys(provider.models).find(
				(key) => !usedModelKeys.has(key),
			);
			if (!nextModelKey) return;
			const fullId = `${providerKey}/${nextModelKey}`;
			const model = provider.models[nextModelKey];
			updateMarkups({
				...modelMarkups,
				[fullId]: { markup: defaultMarkup, humanModelName: model?.name },
			});
		},
		[defaultMarkup, modelMarkups, providerGroups, providers, updateMarkups],
	);

	return {
		providers,
		modelsLoading,
		modelMarkups,
		defaultMarkup,
		providerGroups,
		activeProviderKeys,
		availableProviders,
		handleModelChange,
		handleMarkupChange,
		handleDefaultMarkupChange,
		handleCostChange,
		handleRemoveModel,
		handleRemoveProvider,
		addProvider,
		addModelToProvider,
	};
}

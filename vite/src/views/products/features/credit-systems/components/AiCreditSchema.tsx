import { IconButton } from "@/components/v2/buttons/IconButton";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { useModelsDevPricing } from "@/hooks/queries/useAiModelsQuery";
import type { CreateFeature } from "@autumn/shared";
import { PlusIcon, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { AiCreditSchemaRow } from "./AiCreditSchemaRow";

interface AiCreditSchemaProps {
	creditSystem: CreateFeature;
	setCreditSystem: (creditSystem: CreateFeature) => void;
}

/** Group model_markups keys by their provider prefix */
function groupByProvider(
	modelMarkups: Record<
		string,
		{
			markup: number;
			humanModelName?: string;
			input_cost?: number;
			output_cost?: number;
		}
	>,
) {
	const groups: Record<string, string[]> = {};
	for (const fullId of Object.keys(modelMarkups)) {
		const [providerKey] = fullId.split("/");
		if (!groups[providerKey]) groups[providerKey] = [];
		groups[providerKey].push(fullId);
	}
	return groups;
}

export function AiCreditSchema({
	creditSystem,
	setCreditSystem,
}: AiCreditSchemaProps) {
	const { providers, isLoading: modelsLoading } = useModelsDevPricing();
	const modelMarkups = creditSystem.model_markups ?? {};

	const [defaultMarkup, setDefaultMarkup] = useState<number>(0);
	const manuallyEditedModels = useRef<Set<string>>(new Set());

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

	const updateMarkups = (
		updatedMarkups: Record<
			string,
			{
				markup: number;
				humanModelName?: string;
				input_cost?: number;
				output_cost?: number;
			}
		>,
	) => {
		setCreditSystem({ ...creditSystem, model_markups: updatedMarkups });
	};

	const handleModelChange = (
		providerKey: string,
		oldModelKey: string,
		newModelKey: string,
	) => {
		const oldFullId = `${providerKey}/${oldModelKey}`;
		const newFullId = `${providerKey}/${newModelKey}`;
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
	};

	const handleMarkupChange = (
		providerKey: string,
		modelKey: string,
		markup: number,
	) => {
		const fullId = `${providerKey}/${modelKey}`;
		manuallyEditedModels.current.add(fullId);
		updateMarkups({
			...modelMarkups,
			[fullId]: { ...modelMarkups[fullId], markup },
		});
	};

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
		[modelMarkups, creditSystem, setCreditSystem],
	);

	const handleCostChange = (
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
	};

	const handleRemoveModel = (providerKey: string, modelKey: string) => {
		const fullId = `${providerKey}/${modelKey}`;
		manuallyEditedModels.current.delete(fullId);
		const updatedMarkups = { ...modelMarkups };
		delete updatedMarkups[fullId];
		updateMarkups(updatedMarkups);
	};

	const handleRemoveProvider = (providerKey: string) => {
		const updatedMarkups = { ...modelMarkups };
		for (const fullId of providerGroups[providerKey] ?? []) {
			manuallyEditedModels.current.delete(fullId);
			delete updatedMarkups[fullId];
		}
		updateMarkups(updatedMarkups);
	};

	const addProvider = (providerKey: string) => {
		if (providerKey === "custom") {
			updateMarkups({
				...modelMarkups,
				"custom/": { markup: defaultMarkup, input_cost: 0, output_cost: 0 },
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
	};

	const addModelToProvider = (providerKey: string) => {
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
	};

	return (
		<div className="flex flex-col gap-0">
			<div className="flex items-center gap-2 mb-3">
				<FormLabel className="whitespace-nowrap">Default Markup %</FormLabel>
				<Input
					type="number"
					lang="en"
					value={defaultMarkup}
					onChange={(e) =>
						handleDefaultMarkupChange(Number(e.target.value) || 0)
					}
					onBlur={(e) => handleDefaultMarkupChange(Number(e.target.value) || 0)}
					placeholder="0"
					className="w-24"
				/>
			</div>

			<div className="flex flex-col gap-4">
				{activeProviderKeys.map((providerKey) => {
					const provider = providers[providerKey];
					const modelFullIds = providerGroups[providerKey] ?? [];
					const providerName =
						provider?.name ??
						providerKey.charAt(0).toUpperCase() + providerKey.slice(1);

					return (
						<div
							key={providerKey}
							className="rounded-lg border border-border/50 overflow-hidden"
						>
							<div className="flex items-center justify-between px-3 py-2 bg-muted/30">
								<span className="flex items-center gap-2 text-sm font-medium">
									{providerName}
									{providerKey !== "custom" && (
										<img
											src={`https://models.dev/logos/${providerKey}.svg`}
											alt={providerName}
											className="h-4 w-4 dark:invert"
										/>
									)}
								</span>
								<IconButton
									variant="skeleton"
									iconOrientation="center"
									icon={<X className="h-3.5 w-3.5" />}
									onClick={() => handleRemoveProvider(providerKey)}
								/>
							</div>

							<div className="p-3 flex flex-col gap-2">
								{providerKey === "custom" && (
									<p className="text-xs text-t-tertiary mb-1">
										In your API tracking, use the format{" "}
										<code className="bg-muted px-1 py-0.5 rounded">
											custom/{"modelId"}
										</code>
									</p>
								)}
								{modelFullIds.map((fullId) => {
									const [, ...parts] = fullId.split("/");
									const modelKey = parts.join("/");
									const isCustom = providerKey === "custom";
									return (
										<AiCreditSchemaRow
											key={fullId}
											modelKey={modelKey}
											markup={modelMarkups[fullId]?.markup ?? 0}
											humanModelName={modelMarkups[fullId]?.humanModelName}
											provider={
												provider ?? {
													id: providerKey,
													name: providerKey,
													models: {},
												}
											}
											isLoading={modelsLoading}
											isCustom={isCustom}
											inputCost={modelMarkups[fullId]?.input_cost}
											outputCost={modelMarkups[fullId]?.output_cost}
											onModelChange={(oldKey, newKey) =>
												handleModelChange(providerKey, oldKey, newKey)
											}
											onMarkupChange={(key, newMarkup) =>
												handleMarkupChange(providerKey, key, newMarkup)
											}
											onCostChange={(key, field, value) =>
												handleCostChange(providerKey, key, field, value)
											}
											onRemove={(key) => handleRemoveModel(providerKey, key)}
										/>
									);
								})}

								<IconButton
									variant="muted"
									onClick={() => addModelToProvider(providerKey)}
									className="w-fit mt-1"
									icon={<PlusIcon className="h-3.5 w-3.5" />}
									disabled={
										// If all models for this provider are already added, disable the button
										providerKey === "custom"
											? false
											: Object.keys(provider?.models ?? {}).length ===
											  modelFullIds.length
									}
								>
									Add model
								</IconButton>
							</div>
						</div>
					);
				})}
			</div>

			<p className="text-xs text-t-tertiary my-2">All prices in $/M tokens</p>

			<div className="mt-3 w-64" onWheel={(e) => e.stopPropagation()}>
				<SearchableSelect
					value={null}
					onValueChange={addProvider}
					options={availableProviders}
					getOptionValue={(provider) => provider.id}
					getOptionLabel={(provider) => provider.name}
					renderValue={() => (
						<span className="flex items-center gap-1.5">
							<PlusIcon className="h-3.5 w-3.5" />
							Add provider
						</span>
					)}
					placeholder="Add provider"
					searchable
					searchPlaceholder="Search providers..."
					emptyText="No providers available"
					disabled={modelsLoading}
				/>
			</div>
		</div>
	);
}

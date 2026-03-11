import type { CreateFeature } from "@autumn/shared";
import { PlusIcon, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { useModelsDevPricing } from "@/hooks/queries/useOpenRouterModels";
import { AiCreditSchemaRow } from "./AiCreditSchemaRow";

interface AiCreditSchemaProps {
	creditSystem: CreateFeature;
	setCreditSystem: (creditSystem: CreateFeature) => void;
}

/** Group model_markups keys by their provider prefix */
function groupByProvider(
	modelMarkups: Record<string, { markup: number; humanModelName?: string }>,
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

	const availableProviders = useMemo(
		() =>
			Object.values(providers).filter(
				(provider) => !activeProviderKeys.includes(provider.id),
			),
		[providers, activeProviderKeys],
	);

	const updateMarkups = (
		updatedMarkups: Record<string, { markup: number; humanModelName?: string }>,
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
		const markup = updatedMarkups[oldFullId]?.markup ?? 0;

		if (manuallyEditedModels.current.has(oldFullId)) {
			manuallyEditedModels.current.delete(oldFullId);
			manuallyEditedModels.current.add(newFullId);
		}

		delete updatedMarkups[oldFullId];
		const newModel = providers[providerKey]?.models[newModelKey];
		updatedMarkups[newFullId] = { markup, humanModelName: newModel?.name };
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
					const providerName = provider?.name ?? providerKey;

					return (
						<div
							key={providerKey}
							className="rounded-lg border border-border/50 overflow-hidden"
						>
							<div className="flex items-center justify-between px-3 py-2 bg-muted/30">
								<span className="text-sm font-medium">{providerName}</span>
								<IconButton
									variant="skeleton"
									iconOrientation="center"
									icon={<X className="h-3.5 w-3.5" />}
									onClick={() => handleRemoveProvider(providerKey)}
								/>
							</div>

							<div className="p-3 flex flex-col gap-2">
								<div className="hidden lg:grid lg:grid-cols-[minmax(0,2fr)_auto_auto_auto_auto_auto_auto] gap-2 mb-1">
									<FormLabel className="truncate">Model</FormLabel>
									<FormLabel className="w-24">Actual In</FormLabel>
									<FormLabel className="w-24">Actual Out</FormLabel>
									<FormLabel className="w-20">Markup %</FormLabel>
									<FormLabel className="w-24">User In</FormLabel>
									<FormLabel className="w-24">User Out</FormLabel>
									<div className="w-8" />
								</div>

								{modelFullIds.map((fullId) => {
									const [, ...parts] = fullId.split("/");
									const modelKey = parts.join("/");
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
											onModelChange={(oldKey, newKey) =>
												handleModelChange(providerKey, oldKey, newKey)
											}
											onMarkupChange={(key, newMarkup) =>
												handleMarkupChange(providerKey, key, newMarkup)
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
								>
									Add model
								</IconButton>
							</div>
						</div>
					);
				})}
			</div>

			<p className="hidden lg:block text-xs text-t-tertiary my-2">
				All prices are in $/M tokens
			</p>

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

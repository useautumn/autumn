import type { CreateFeature } from "@autumn/shared";
import { PlusIcon, X } from "lucide-react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { useAiCreditSchema } from "../hooks/useAiCreditSchema";
import { AiCreditSchemaRow } from "./AiCreditSchemaRow";

interface AiCreditSchemaProps {
	creditSystem: CreateFeature;
	setCreditSystem: (
		creditSystem: CreateFeature | ((prev: CreateFeature) => CreateFeature),
	) => void;
}

export function AiCreditSchema({
	creditSystem,
	setCreditSystem,
}: AiCreditSchemaProps) {
	const {
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
	} = useAiCreditSchema({ creditSystem, setCreditSystem });

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
			<div className="flex flex-col gap-2">
				{activeProviderKeys.map((providerKey) => {
					const provider = providers[providerKey];
					const modelFullIds = providerGroups[providerKey] ?? [];
					const providerName =
						provider?.name ??
						providerKey.charAt(0).toUpperCase() + providerKey.slice(1);

					return (
						<div
							key={providerKey}
							className="py-1.5 border-b border-border/30 last:border-b-0"
						>
							<div className="flex items-center justify-between px-0.5 py-1">
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

							<div className="flex flex-col gap-1 px-0.5 py-1">
								{providerKey === "custom" && (
									<p className="text-xs text-t-tertiary mb-0.5">
										In your API tracking, use the format{" "}
										<code className="bg-muted px-1 py-0.5 rounded">
											custom/{"modelId"}
										</code>
									</p>
								)}

								<div className="grid grid-cols-[minmax(0,2.7fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] items-center gap-1 px-0.5 pb-0.5">
									<div className="min-w-0 text-xs font-semibold text-t-tertiary whitespace-nowrap">
										Model
									</div>
									<div className="text-xs font-semibold text-t-tertiary whitespace-nowrap">
										{providerKey === "custom" ? "In $/M" : "Cost In"}
									</div>
									<div className="text-xs font-semibold text-t-tertiary whitespace-nowrap">
										{providerKey === "custom" ? "Out $/M" : "Cost Out"}
									</div>
									<div className="text-xs font-semibold text-t-tertiary whitespace-nowrap">
										Markup %
									</div>
									<div className="w-6" />
								</div>

								{modelFullIds.map((fullId) => {
									const [, ...parts] = fullId.split("/");
									const modelKey = parts.join("/");
									const isCustom = providerKey === "custom";
									return (
										<AiCreditSchemaRow
											key={fullId}
											modelKey={modelKey}
											markup={modelMarkups[fullId]?.markup ?? 0}
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
									className="w-fit mt-0.5"
									icon={<PlusIcon className="h-3.5 w-3.5" />}
									disabled={
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

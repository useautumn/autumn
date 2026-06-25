import {
	FormLabel,
	Input,
	SearchableSelect,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { InfoIcon } from "lucide-react";
import { useAiProviders } from "../hooks/useAiProviders";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";
import { AiCreditSchemaTable } from "./AiCreditSchemaTable";

interface AiCreditSchemaProps {
	form: CreditSystemFormInstance;
}

export function AiCreditSchema({ form }: AiCreditSchemaProps) {
	const {
		providers,
		isLoading,
		defaultMarkup,
		providerGroups,
		activeProviderKeys,
		availableProviders,
		addProvider,
		removeKeys,
		removeProvider,
		setProviderMarkup,
		renameKey,
	} = useAiProviders(form);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<FormLabel>Default Markup %</FormLabel>
				<Input
					type="text"
					inputMode="numeric"
					value={defaultMarkup === 0 ? "" : String(defaultMarkup)}
					onChange={(e) => {
						const raw = e.target.value;
						if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
							form.setFieldValue("defaultMarkup", raw === "" ? 0 : Number(raw));
						}
					}}
					placeholder="0"
				/>
			</div>

			{activeProviderKeys.length > 0 && (
				<div className="flex flex-col gap-3">
					{activeProviderKeys.map((providerKey) => {
						const provider = providers[providerKey];
						const modelFullIds = providerGroups[providerKey] ?? [];
						const providerName =
							provider?.name ??
							providerKey.charAt(0).toUpperCase() + providerKey.slice(1);

						return (
							<AiCreditSchemaTable
								key={providerKey}
								form={form}
								providerKey={providerKey}
								providerName={providerName}
								modelFullIds={modelFullIds}
								provider={
									provider ?? { id: providerKey, name: providerKey, models: {} }
								}
								isLoading={isLoading}
								removeKeys={removeKeys}
								removeProvider={removeProvider}
								setProviderMarkup={setProviderMarkup}
								renameKey={renameKey}
							/>
						);
					})}
				</div>
			)}

			<div
				className="flex flex-col gap-1.5"
				onWheel={(e) => e.stopPropagation()}
			>
				<FormLabel className="flex items-center gap-1.5">
					Add Provider Override
					<Tooltip>
						<TooltipTrigger asChild>
							<InfoIcon className="size-3.5 cursor-help text-tertiary-foreground" />
						</TooltipTrigger>
						<TooltipContent>
							Add specific markup overrides for certain providers/models.
						</TooltipContent>
					</Tooltip>
				</FormLabel>
				<SearchableSelect
					value={null}
					onValueChange={addProvider}
					options={availableProviders}
					getOptionValue={(p) => p.id}
					getOptionLabel={(p) => p.name}
					renderValue={() => (
						<span className="text-tertiary-foreground">Select provider</span>
					)}
					placeholder="Select provider"
					searchable
					searchPlaceholder="Search providers..."
					emptyText="No providers available"
					disabled={isLoading}
				/>
			</div>
		</div>
	);
}

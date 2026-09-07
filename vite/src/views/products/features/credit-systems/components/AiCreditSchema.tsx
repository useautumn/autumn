import {
	FormLabel,
	SearchableSelect,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { InfoIcon } from "lucide-react";
import { useAiProviders } from "../hooks/useAiProviders";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";
import { AiCreditSchemaTable } from "./AiCreditSchemaTable";
import { NumericDraftInput } from "./NumericDraftInput";

interface AiCreditSchemaProps {
	form: CreditSystemFormInstance;
}

export function AiCreditSchema({ form }: AiCreditSchemaProps) {
	const {
		resolvedProviders,
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
				<FormLabel>Default markup %</FormLabel>
				<NumericDraftInput
					aria-label="Default markup"
					value={defaultMarkup || undefined}
					onCommit={(next) => form.setFieldValue("defaultMarkup", next ?? 0)}
					placeholder="0"
				/>
			</div>

			{activeProviderKeys.length > 0 && (
				<div className="flex flex-col gap-3">
					{activeProviderKeys.map((providerKey) => {
						const provider = resolvedProviders[providerKey];
						const modelFullIds = providerGroups[providerKey] ?? [];

						return (
							<AiCreditSchemaTable
								key={providerKey}
								form={form}
								providerKey={providerKey}
								providerName={provider.name}
								modelFullIds={modelFullIds}
								provider={provider}
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
					Add provider override
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

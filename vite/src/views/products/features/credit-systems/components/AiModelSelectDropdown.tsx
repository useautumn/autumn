import type { ModelsDevModel, ModelsDevProvider } from "@autumn/shared";
import { SearchableSelect } from "@autumn/ui";
import { useMemo } from "react";

interface AiModelSelectDropdownProps {
	value: string;
	onValueChange: (modelKey: string) => void;
	provider: ModelsDevProvider;
	isLoading: boolean;
}

export function AiModelSelectDropdown({
	value,
	onValueChange,
	provider,
	isLoading,
}: AiModelSelectDropdownProps) {
	const models: ModelsDevModel[] = useMemo(
		() => Object.values(provider.models),
		[provider],
	);

	return (
		<div onWheel={(e) => e.stopPropagation()}>
			<SearchableSelect
				triggerClassName="!border-0 !shadow-none !ring-0 !bg-transparent !p-0 !px-0.5 !rounded-none"
				value={value || null}
				onValueChange={onValueChange}
				options={models}
				getOptionValue={(model) => model.id}
				getOptionLabel={(model) => model.name}
				renderValue={(option) =>
					option ? (
						<span className="text-sm">{option.name}</span>
					) : provider.models[value]?.name ? (
						<span className="text-sm">{provider.models[value].name}</span>
					) : value ? (
						<span className="text-sm">{value}</span>
					) : (
						<span className="text-sm text-tertiary-foreground">
							{isLoading ? "Loading..." : "Select model"}
						</span>
					)
				}
				placeholder={isLoading ? "Loading..." : "Select model"}
				searchable
				searchPlaceholder="Search models..."
				emptyText="No models found"
				disabled={isLoading}
			/>
		</div>
	);
}

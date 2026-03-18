import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import type {
	ModelsDevModel,
	ModelsDevProvider,
} from "@/hooks/queries/useAiModelsQuery";
import { useMemo } from "react";

interface AiModelSelectDropdownProps {
	value: string;
	onValueChange: (modelKey: string) => void;
	provider: ModelsDevProvider;
	isLoading: boolean;
	humanModelName?: string;
}

export function AiModelSelectDropdown({
	value,
	onValueChange,
	provider,
	isLoading,
	humanModelName,
}: AiModelSelectDropdownProps) {
	const models: ModelsDevModel[] = useMemo(
		() => Object.values(provider.models),
		[provider],
	);

	return (
		<div onWheel={(e) => e.stopPropagation()}>
			<SearchableSelect
				contentClassName="w-full"
				value={value || null}
				onValueChange={onValueChange}
				options={models}
				getOptionValue={(model) => model.id}
				getOptionLabel={(model) => model.name}
				renderValue={(option) =>
					option ? (
						<span>{option.name}</span>
					) : humanModelName ? (
						<span>{humanModelName}</span>
					) : (
						<span className="text-t3">
							{isLoading ? "Loading models..." : "Select model"}
						</span>
					)
				}
				placeholder={isLoading ? "Loading models..." : "Select model"}
				searchable
				searchPlaceholder="Search models..."
				emptyText="No models found"
				disabled={isLoading}
			/>
		</div>
	);
}

import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import type { OpenRouterModel } from "@/hooks/queries/useOpenRouterModels";

interface AiModelSelectDropdownProps {
	value: string;
	onValueChange: (modelId: string) => void;
	models: OpenRouterModel[];
	isLoading: boolean;
}

export function AiModelSelectDropdown({
	value,
	onValueChange,
	models,
	isLoading,
}: AiModelSelectDropdownProps) {
	const handleValueChange = (modelId: string) => {
		const model = models.find((m) => m.id === modelId);
		if (model) onValueChange(modelId);
	};

	return (
		// Prevent wheel events from bubbling to the sheet's scroll container
		// so the dropdown list can be scrolled independently
		<div onWheel={(e) => e.stopPropagation()}>
			<SearchableSelect
				value={value || null}
				onValueChange={handleValueChange}
				options={models}
				getOptionValue={(model) => model.id}
				getOptionLabel={(model) => model.name}
				placeholder={isLoading ? "Loading models..." : "Select model"}
				searchable
				searchPlaceholder="Search models..."
				emptyText="No models found"
				disabled={isLoading}
			/>
		</div>
	);
}

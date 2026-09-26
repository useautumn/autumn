import type { Entity } from "@autumn/shared";
import { SearchableSelect } from "@autumn/ui";
import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useAnalyticsContext } from "../AnalyticsContext";
import { useAnalyticsFilterState } from "../hooks/useAnalyticsFilterState";

const ALL_ENTITIES = "__all_entities__";
const SEARCH_THRESHOLD = 5;

type EntityOption = { id: string; name: string };

export const SelectEntityDropdown = ({
	renderTrigger,
}: {
	/** Draws the button that opens the picker, given the chosen entity's name. */
	renderTrigger: (label: string) => ReactNode;
}) => {
	const { filterStates, setFilterStates } = useAnalyticsFilterState();
	const { customer } = useAnalyticsContext();
	const entities: Entity[] = customer?.entities || [];

	if (!customer || entities.length === 0) {
		return null;
	}

	const options: EntityOption[] = [
		{ id: ALL_ENTITIES, name: `All entities (${entities.length})` },
		...entities.map((entity) => ({
			id: entity.id,
			name: entity.name || entity.id,
		})),
	];

	return (
		<SearchableSelect<EntityOption>
			value={filterStates.entity_id ?? ALL_ENTITIES}
			onValueChange={(value) =>
				setFilterStates({ entity_id: value === ALL_ENTITIES ? null : value })
			}
			options={options}
			getOptionValue={(option) => option.id}
			getOptionLabel={(option) => option.name}
			searchable={entities.length > SEARCH_THRESHOLD}
			searchPlaceholder="Search entities..."
			emptyText="No entities found"
			trigger={renderTrigger(
				entities.find((entity) => entity.id === filterStates.entity_id)?.name ??
					filterStates.entity_id ??
					"All entities",
			)}
			contentClassName="min-w-[220px]"
			renderOption={(option, isSelected) => (
				<>
					<span className="flex-1 truncate min-w-0">{option.name}</span>
					<CheckIcon
						className={cn(
							"size-4 shrink-0 transition-opacity",
							isSelected ? "opacity-100" : "opacity-0",
						)}
					/>
				</>
			)}
		/>
	);
};

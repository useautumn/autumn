import type { Entity } from "@autumn/shared";
import { SearchableSelect } from "@autumn/ui";
import type { ReactNode } from "react";
import { useAnalyticsContext } from "../AnalyticsContext";
import { useAnalyticsFilterState } from "../hooks/useAnalyticsFilterState";
import { SelectOptionLabel } from "./SelectOptionLabel";

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
	// Shown as soon as a customer is picked, so the row never reflows when their record lands.
	if (!filterStates.customer_id) return null;

	const entities: Entity[] = customer?.entities ?? [];
	const hasNoEntities = Boolean(customer) && entities.length === 0;

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
			disabled={hasNoEntities}
			searchPlaceholder="Search entities..."
			emptyText="No entities found"
			trigger={renderTrigger(
				hasNoEntities
					? "None"
					: (entities.find((entity) => entity.id === filterStates.entity_id)
							?.name ??
							filterStates.entity_id ??
							"All entities"),
			)}
			contentClassName="min-w-[220px] rounded-xl"
			renderOption={(option, isSelected) => (
				<SelectOptionLabel name={option.name} isSelected={isSelected} />
			)}
		/>
	);
};

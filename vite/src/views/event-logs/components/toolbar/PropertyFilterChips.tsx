import { FilterChip } from "@autumn/ui";
import {
	useLogsFilters,
	withoutPropertyFilter,
} from "../../hooks/useLogsFilters";

export const PropertyFilterChips = () => {
	const { setFilters, propertyFilters } = useLogsFilters();

	return propertyFilters.map(({ key, value }) => (
		<FilterChip
			key={key}
			label={key}
			value={value}
			onRemove={() =>
				setFilters({
					properties: withoutPropertyFilter({ propertyFilters, key }),
				})
			}
		/>
	));
};

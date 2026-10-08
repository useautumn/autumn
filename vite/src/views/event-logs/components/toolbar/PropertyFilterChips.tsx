import { FilterChip } from "@autumn/ui";
import {
	parsePropertyFilter,
	useLogsFilters,
} from "../../hooks/useLogsFilters";

export const PropertyFilterChips = () => {
	const { filters, setFilters } = useLogsFilters();

	return filters.properties.map((raw) => {
		const filter = parsePropertyFilter({ raw });
		if (!filter) return null;
		return (
			<FilterChip
				key={raw}
				label={filter.key}
				value={filter.value}
				onRemove={() =>
					setFilters({
						properties: filters.properties.filter(
							(existing) => existing !== raw,
						),
					})
				}
			/>
		);
	});
};

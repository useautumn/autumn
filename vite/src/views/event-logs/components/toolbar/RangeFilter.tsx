import { CalendarBlankIcon } from "@phosphor-icons/react";
import { FilterTriggerButton } from "@/views/customers/customer/analytics/components/FilterTriggerButton";
import {
	LOG_RANGE_LABELS,
	LOG_RANGES,
	type LogRange,
	useLogsFilters,
} from "../../hooks/useLogsFilters";
import { FilterSelect } from "./FilterSelect";

const RANGE_OPTIONS = LOG_RANGES.map((range) => ({
	id: range,
	name: LOG_RANGE_LABELS[range],
}));

export const RangeFilter = () => {
	const { filters, setFilters } = useLogsFilters();

	return (
		<FilterSelect
			value={filters.range}
			onValueChange={(value) => setFilters({ range: value as LogRange })}
			options={RANGE_OPTIONS}
			trigger={
				<FilterTriggerButton
					leading={
						<CalendarBlankIcon className="size-3.5 text-tertiary-foreground" />
					}
					value={LOG_RANGE_LABELS[filters.range]}
				/>
			}
		/>
	);
};

import { FilterTriggerButton } from "@/views/customers/customer/analytics/components/FilterTriggerButton";
import { useLogFeatures } from "../../hooks/useLogFeatures";
import { useLogsFilters } from "../../hooks/useLogsFilters";
import { ALL_OPTION_ID, FilterSelect } from "./FilterSelect";

export const EventFilter = () => {
	const { filters, setFilters } = useLogsFilters();
	const { features, nameFor } = useLogFeatures();
	const options = [
		{ id: ALL_OPTION_ID, name: "All events" },
		...features.map((feature) => ({ id: feature.id, name: feature.name })),
	];

	return (
		<FilterSelect
			value={filters.feature_id ?? ALL_OPTION_ID}
			onValueChange={(value) =>
				setFilters({ feature_id: value === ALL_OPTION_ID ? null : value })
			}
			options={options}
			searchable
			searchPlaceholder="Search events..."
			emptyText="No events found"
			trigger={
				<FilterTriggerButton
					label="Event"
					value={
						filters.feature_id ? nameFor(filters.feature_id) : "All events"
					}
				/>
			}
		/>
	);
};

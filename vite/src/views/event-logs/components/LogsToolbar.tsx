import { CustomerFilter } from "./toolbar/CustomerFilter";
import { EventFilter } from "./toolbar/EventFilter";
import { LiveToggle } from "./toolbar/LiveToggle";
import { PropertyFilterButton } from "./toolbar/PropertyFilterButton";
import { PropertyFilterChips } from "./toolbar/PropertyFilterChips";
import { RangeFilter } from "./toolbar/RangeFilter";

export const LogsToolbar = () => (
	<div className="flex shrink-0 items-start justify-between gap-2">
		<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
			<EventFilter />
			<CustomerFilter />
			<PropertyFilterButton />
			<PropertyFilterChips />
		</div>
		<div className="flex shrink-0 items-center gap-2">
			<RangeFilter />
			<LiveToggle />
		</div>
	</div>
);

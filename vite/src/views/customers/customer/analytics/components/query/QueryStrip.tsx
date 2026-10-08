import { CustomerComboBox } from "../CustomerComboBox";
import { FilterTriggerButton } from "../FilterTriggerButton";
import { SelectEntityDropdown } from "../SelectEntityDropdown";
import { BinSizeCell } from "./BinSizeCell";
import { EventsCell } from "./EventsCell";
import { GroupByCell } from "./GroupByCell";
import { MeasureCell } from "./MeasureCell";
import { RangeCell } from "./RangeCell";
import { useBreakdown } from "./useBreakdown";

/** The whole analytics query as one row of filter buttons: what on the left, when on the right. */
export const QueryStrip = ({ propertyKeys }: { propertyKeys: string[] }) => {
	const { customerId } = useBreakdown();

	return (
		<div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pb-4">
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<CustomerComboBox
					renderTrigger={(label) => (
						<FilterTriggerButton label="Customer" value={label} />
					)}
				/>
				<SelectEntityDropdown
					renderTrigger={(label) => (
						<FilterTriggerButton label="Entity" value={label} />
					)}
				/>
				<EventsCell />
				{/* Deductions are tracked per customer, so the choice only exists with one picked. */}
				{customerId && <MeasureCell />}
				<GroupByCell propertyKeys={propertyKeys} />
			</div>
			<div className="flex items-center gap-2">
				<RangeCell />
				<BinSizeCell />
			</div>
		</div>
	);
};

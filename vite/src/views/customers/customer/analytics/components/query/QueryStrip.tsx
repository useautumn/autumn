import { CustomerComboBox } from "../CustomerComboBox";
import { SelectEntityDropdown } from "../SelectEntityDropdown";
import { BinSizeCell } from "./BinSizeCell";
import { EventsCell } from "./EventsCell";
import { GroupByCell } from "./GroupByCell";
import { MeasureCell } from "./MeasureCell";
import { RangeCell } from "./RangeCell";
import { StripCell } from "./StripCell";
import { useBreakdown } from "./useBreakdown";

// Relative widths, so wordier cells (events, range) get more room.
const CELL_WIDTHS = {
	customer: "flex-[1.3_1_0%]",
	entity: "flex-[1_1_0%]",
	events: "flex-[1.5_1_0%]",
	measure: "flex-[0.9_1_0%]",
	groupBy: "flex-[1.1_1_0%]",
	range: "flex-[1.3_1_0%]",
	binSize: "flex-[0.8_1_0%]",
} as const;

/** The whole analytics query as one bordered row of labelled cells. */
export const QueryStrip = ({ propertyKeys }: { propertyKeys: string[] }) => {
	const { customerId } = useBreakdown();

	return (
		<div className="flex items-stretch h-[52px] shrink-0 mb-8 rounded-[10px] border bg-interactive-secondary overflow-hidden">
			<CustomerComboBox
				renderTrigger={(label) => (
					<StripCell
						label="Customer"
						value={label}
						isPlaceholder={!customerId}
						className={CELL_WIDTHS.customer}
					/>
				)}
			/>
			<SelectEntityDropdown
				renderTrigger={(label) => (
					<StripCell
						label="Entity"
						value={label}
						className={CELL_WIDTHS.entity}
					/>
				)}
			/>
			<EventsCell className={CELL_WIDTHS.events} />
			{/* Deductions are tracked per customer, so the choice only exists with one picked. */}
			{customerId && <MeasureCell className={CELL_WIDTHS.measure} />}
			<GroupByCell
				propertyKeys={propertyKeys}
				className={CELL_WIDTHS.groupBy}
			/>
			<RangeCell className={CELL_WIDTHS.range} />
			<BinSizeCell className={CELL_WIDTHS.binSize} />
		</div>
	);
};

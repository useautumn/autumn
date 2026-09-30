import { DateInputUnix, Switch } from "@autumn/ui";
import { addDays } from "date-fns";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";

export function EndDateConfigRow({
	endDate,
	minUnixDate,
	onEndDateChange,
}: {
	endDate: number | null;
	minUnixDate: number;
	onEndDateChange: (endDate: number | null) => void;
}) {
	return (
		<ConfigRow
			title="End Date"
			description="End the plan on a future date"
			expanded={endDate !== null}
			action={
				<Switch
					checked={endDate !== null}
					onCheckedChange={(checked) =>
						onEndDateChange(checked ? addDays(minUnixDate, 1).getTime() : null)
					}
				/>
			}
		>
			<DateInputUnix
				unixDate={endDate}
				setUnixDate={onEndDateChange}
				disablePastDates
				minUnixDate={minUnixDate}
				withTime
			/>
		</ConfigRow>
	);
}

import { DateInputUnix, Switch } from "@autumn/ui";
import { addDays } from "date-fns";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";

const BACKDATE_START_YEAR_LOOKBACK = 25;

function startDateDescription({
	isMultiPlan,
	allowBackdate,
}: {
	isMultiPlan: boolean;
	allowBackdate: boolean;
}) {
	if (isMultiPlan) return "Backdate every plan to the same start date";
	if (allowBackdate)
		return "Start the new subscription on a past or future date";
	return "Schedule the plan to start on a future date";
}

/** A multi-plan attach can only backdate, so its default and bounds sit in the past. */
export function AttachStartDateRow({
	startDate,
	isMultiPlan,
	allowBackdate,
	onStartDateChange,
}: {
	startDate: number | null;
	isMultiPlan: boolean;
	allowBackdate: boolean;
	onStartDateChange: (startDate: number | null) => void;
}) {
	const defaultOffsetDays = isMultiPlan ? -1 : 1;

	return (
		<ConfigRow
			title="Start Date"
			description={startDateDescription({ isMultiPlan, allowBackdate })}
			expanded={startDate !== null}
			action={
				<Switch
					checked={startDate !== null}
					onCheckedChange={(checked) =>
						onStartDateChange(
							checked ? addDays(Date.now(), defaultOffsetDays).getTime() : null,
						)
					}
				/>
			}
		>
			<DateInputUnix
				unixDate={startDate}
				setUnixDate={onStartDateChange}
				disablePastDates={!allowBackdate}
				disableFutureDates={isMultiPlan}
				minUnixDate={allowBackdate ? undefined : Date.now()}
				maxUnixDate={isMultiPlan ? Date.now() : undefined}
				fromYear={
					allowBackdate
						? new Date().getFullYear() - BACKDATE_START_YEAR_LOOKBACK
						: undefined
				}
				withTime
			/>
		</ConfigRow>
	);
}

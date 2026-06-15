import type { StartingAfterDuration } from "@api/billing/createSchedule/createScheduleParamsV0";
import type { EntitlementDuration } from "@models/productModels/entModels/entModels";
import type { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums";
import { addDays, addMonths, addWeeks, addYears } from "date-fns";

type DurationType = FreeTrialDuration | EntitlementDuration | StartingAfterDuration;

export const addDuration = ({
	now,
	durationType,
	durationLength = 1,
}: {
	now: number;
	durationType: DurationType;
	durationLength?: number;
}) => {
	switch (durationType) {
		case "day":
			return addDays(now, durationLength).getTime();
		case "week":
			return addWeeks(now, durationLength).getTime();
		case "month":
			return addMonths(now, durationLength).getTime();
		case "year":
			return addYears(now, durationLength).getTime();
		default:
			throw new Error(`Invalid duration type: ${durationType}`);
	}
};

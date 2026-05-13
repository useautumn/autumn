import { EntitlementDuration } from "@models/productModels/entModels/entModels";
import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums";
import { addDays, addMonths, addWeeks, addYears } from "date-fns";

export const addDuration = ({
	now,
	durationType,
	durationLength = 1,
}: {
	now: number;
	durationType: FreeTrialDuration | EntitlementDuration;
	durationLength?: number;
}) => {
	switch (durationType) {
		case FreeTrialDuration.Day:
			return addDays(now, durationLength).getTime();
		case EntitlementDuration.Week:
			return addWeeks(now, durationLength).getTime();
		case FreeTrialDuration.Month:
			return addMonths(now, durationLength).getTime();
		case FreeTrialDuration.Year:
			return addYears(now, durationLength).getTime();
		default:
			throw new Error(`Invalid duration type: ${durationType}`);
	}
};

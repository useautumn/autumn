import { type AttachParamsV1, isFutureStartDate } from "@autumn/shared";

export const getAttachBillingStartsAt = ({
	params,
	currentEpochMs,
}: {
	params: AttachParamsV1;
	currentEpochMs: number;
}): number | undefined => {
	const startsAt = params.starts_at;
	if (
		params.enable_plan_immediately !== true ||
		startsAt === undefined ||
		!isFutureStartDate(startsAt, currentEpochMs)
	){
		return undefined;
	}

	return startsAt;
};

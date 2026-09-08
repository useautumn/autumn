import {
	type DbUsageLimit,
	DbUsageLimitSchema,
	type UsageLimitUpdate,
} from "@autumn/shared";

export const getUsageLimitConfigUpdate = ({
	usageLimits,
}: {
	usageLimits?: UsageLimitUpdate[];
}): DbUsageLimit[] | undefined => {
	if (usageLimits === undefined) return undefined;
	const config = usageLimits.flatMap((entry) =>
		entry.source !== "plan" && entry.limit !== undefined
			? [DbUsageLimitSchema.parse(entry)]
			: [],
	);
	return usageLimits.length === 0 || config.length > 0 ? config : undefined;
};

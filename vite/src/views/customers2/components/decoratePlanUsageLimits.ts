import {
	type ApiUsageLimit,
	type DbUsageLimit,
	usageLimitIdentity,
} from "@autumn/shared";

export const decoratePlanUsageLimits = ({
	planUsageLimits,
	decoratedPlanUsageLimits,
}: {
	planUsageLimits: DbUsageLimit[];
	decoratedPlanUsageLimits: ApiUsageLimit[] | undefined;
}): ApiUsageLimit[] => {
	const usageByIdentity = new Map(
		(decoratedPlanUsageLimits ?? []).map((usageLimit) => [
			usageLimitIdentity(usageLimit),
			usageLimit.usage,
		]),
	);
	return planUsageLimits.map((usageLimit) => {
		const usage = usageByIdentity.get(usageLimitIdentity(usageLimit));
		return usage == null ? usageLimit : { ...usageLimit, usage };
	});
};

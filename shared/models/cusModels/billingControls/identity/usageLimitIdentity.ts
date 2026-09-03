import { type DbUsageLimitLike, usageLimitFilterKey } from "../usageLimit.js";

export const usageLimitIdentity = (
	usageLimit: Pick<DbUsageLimitLike, "feature_id" | "filter">,
): string =>
	`${usageLimit.feature_id}|${usageLimitFilterKey(usageLimit.filter)}`;

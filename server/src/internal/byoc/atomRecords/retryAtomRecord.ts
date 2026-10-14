import { ByocCacheStatus } from "@autumn/shared";
import { cacheNotFailed } from "../utils/byocCacheUtils.js";
import { refreshAtomRecord } from "./refreshAtomRecord.js";
import type { AtomContext } from "./types/atomContext.js";
import type { AtomRecord } from "./types/atomRecord.js";

export const retryAtomRecord = async <T extends AtomRecord>({
	ctx,
	record,
}: {
	ctx: AtomContext<T>;
	record: T;
}): Promise<T> => {
	if (record.status !== ByocCacheStatus.Failed) throw cacheNotFailed();
	await ctx.deployer.retry({ deploymentGroupId: record.deployment_group_id });
	return (await refreshAtomRecord({ ctx, record })) ?? record;
};

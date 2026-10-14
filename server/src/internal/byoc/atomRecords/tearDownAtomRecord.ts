import { ByocCacheStatus } from "@autumn/shared";
import { refreshAtomRecord } from "./refreshAtomRecord.js";
import type { AtomContext } from "./types/atomContext.js";
import type { AtomRecord } from "./types/atomRecord.js";

export const tearDownAtomRecord = async <T extends AtomRecord>({
	ctx,
	record,
}: {
	ctx: AtomContext<T>;
	record: T;
}): Promise<T | null> => {
	await ctx.deployer.delete({ deploymentGroupId: record.deployment_group_id });
	const removing = { ...record, status: ByocCacheStatus.Removing, error: null };
	await ctx.storage.update({ from: record, to: removing });

	return refreshAtomRecord({ ctx, record: removing });
};

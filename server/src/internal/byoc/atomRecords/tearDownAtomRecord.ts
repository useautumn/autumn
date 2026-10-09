import { ByocCacheStatus } from "@autumn/shared";
import { refreshAtomRecord } from "./refreshAtomRecord.js";
import type { AtomContext } from "./types/atomContext.js";
import type { AtomRecord } from "./types/atomRecord.js";

/** Tears the Atom down, or retries a removal that stopped; the record stays as removing until its deployer has nothing left. */
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

	// A setup that never ran has nothing to tear down, so this read forgets it at once.
	return refreshAtomRecord({ ctx, record: removing });
};

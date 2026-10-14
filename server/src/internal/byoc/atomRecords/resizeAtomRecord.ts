import { isByocCacheReady } from "@autumn/byoc";
import type { ByocCacheMachine } from "@autumn/shared";
import { cacheNotRunning } from "../utils/byocCacheUtils.js";
import { refreshAtomRecord } from "./refreshAtomRecord.js";
import type { AtomContext } from "./types/atomContext.js";
import type { AtomRecord } from "./types/atomRecord.js";

export const resizeAtomRecord = async <T extends AtomRecord>({
	ctx,
	record,
	machine,
}: {
	ctx: AtomContext<T>;
	record: T;
	machine: ByocCacheMachine;
}): Promise<T> => {
	const current = await refreshAtomRecord({ ctx, record });
	if (!isByocCacheReady(current)) throw cacheNotRunning();

	await ctx.deployer.resize({
		deploymentGroupId: current.deployment_group_id,
		machine,
	});
	return (await refreshAtomRecord({ ctx, record: current })) ?? current;
};

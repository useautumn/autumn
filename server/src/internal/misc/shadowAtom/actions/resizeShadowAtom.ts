import { type ByocCacheMachine, ByocCacheStatus } from "@autumn/shared";
import { cacheNotRunning } from "@/internal/byoc/utils/byocCacheUtils.js";
import { getShadowAtomDeployer } from "../getShadowAtomDeployer.js";
import { withShadowAtomLock } from "../withShadowAtomLock.js";
import { findShadowAtom } from "./findShadowAtom.js";

/** Only a running Atom moves; one still being set up takes its machine from create. */
export const resizeShadowAtom = ({
	machine,
}: {
	machine: ByocCacheMachine;
}): Promise<void> =>
	withShadowAtomLock({
		fn: async () => {
			const deployment = await findShadowAtom();
			if (deployment?.status !== ByocCacheStatus.Ready) throw cacheNotRunning();
			await getShadowAtomDeployer().resize({
				deploymentGroupId: deployment.deploymentGroupId,
				machine,
			});
		},
	});

import type { ShadowAtomConfig } from "@autumn/edge-config";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import {
	SHADOW_ATOM_CONFIG_LOCK_KEY,
	shadowAtomConfigStore,
} from "../shadowAtomConfigStore.js";

/** Re-reads the file right before writing, so a slow alien call never writes back a stale snapshot; with `followingGroupId`, only while the file still follows that group. */
export const patchShadowAtomConfig = ({
	patch,
	followingGroupId,
}: {
	patch: Partial<ShadowAtomConfig>;
	followingGroupId?: string;
}): Promise<void> =>
	withLock({
		lockKey: SHADOW_ATOM_CONFIG_LOCK_KEY,
		fn: async () => {
			const config = await shadowAtomConfigStore.readFromSource();
			const hasMovedOn =
				followingGroupId !== undefined &&
				config.deploymentGroupId !== followingGroupId;
			if (hasMovedOn) return;
			await shadowAtomConfigStore.writeToSource({
				config: { ...config, ...patch },
			});
		},
	});

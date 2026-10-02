import type { ShadowAtomConfig } from "@autumn/edge-config";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import {
	SHADOW_ATOM_CONFIG_LOCK_KEY,
	shadowAtomConfigStore,
} from "../shadowAtomConfigStore.js";

/** Re-reads the file right before writing, so a slow alien call never writes back a stale snapshot. */
export const patchShadowAtomConfig = ({
	patch,
}: {
	patch: Partial<ShadowAtomConfig>;
}): Promise<void> =>
	withLock({
		lockKey: SHADOW_ATOM_CONFIG_LOCK_KEY,
		fn: async () => {
			const config = await shadowAtomConfigStore.readFromSource();
			await shadowAtomConfigStore.writeToSource({
				config: { ...config, ...patch },
			});
		},
	});

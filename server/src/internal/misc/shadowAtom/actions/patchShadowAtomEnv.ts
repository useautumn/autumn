import type { ShadowAtomEnvConfig } from "@autumn/edge-config";
import type { AppEnv } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import { shadowAtomConfigStore } from "../shadowAtomConfigStore.js";

/** Re-reads the file right before writing, so a slow alien call never writes back a stale snapshot. */
export const patchShadowAtomEnv = ({
	env,
	patch,
}: {
	env: AppEnv;
	patch: Partial<ShadowAtomEnvConfig>;
}): Promise<void> =>
	withLock({
		lockKey: "lock:shadow-atom-config",
		fn: async () => {
			const config = await shadowAtomConfigStore.readFromSource();
			await shadowAtomConfigStore.writeToSource({
				config: { ...config, [env]: { ...config[env], ...patch } },
			});
		},
	});

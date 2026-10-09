import { tasks } from "@trigger.dev/sdk/v3";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { watchCacheDeploymentTask } from "@/trigger/atom/watchCacheDeploymentTask.js";
import { isTriggerConfigured } from "@/trigger/configureTrigger.js";
import { cacheWatchIdempotencyKey } from "./utils/cacheWatchIdempotencyKey.js";

/** Starts the group's watch, or joins the one running. Without Trigger, page reads still refresh the record. */
export const startCacheDeploymentWatch = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
}): Promise<void> => {
	if (!isTriggerConfigured()) return;
	try {
		await tasks.trigger<typeof watchCacheDeploymentTask>(
			"watch-cache-deployment",
			{ orgId: ctx.org.id, env: ctx.env, deploymentGroupId },
			{ idempotencyKey: await cacheWatchIdempotencyKey({ deploymentGroupId }) },
		);
	} catch (error) {
		// The change it follows already landed; a missing watch only slows updates.
		ctx.logger.warn("Failed to start the Atom watch", {
			data: { deploymentGroupId, error: String(error) },
		});
	}
};

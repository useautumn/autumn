import { AppEnv } from "@autumn/shared";
import { idempotencyKeys, task, wait } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { cacheWatchIdempotencyKey } from "@/internal/byoc/actions/watchCacheDeployment/utils/cacheWatchIdempotencyKey.js";
import { watchCacheDeployment } from "@/internal/byoc/actions/watchCacheDeployment/watchCacheDeployment.js";
import { runWithTriggerContext } from "@/trigger/utils/runWithTriggerContext.js";

const WatchCacheDeploymentPayloadSchema = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	deploymentGroupId: z.string(),
});

type WatchCacheDeploymentPayload = z.infer<
	typeof WatchCacheDeploymentPayloadSchema
>;

const WATCH_CACHE_DEPLOYMENT_TASK_ID = "watch-cache-deployment";

/** Follows an org's Atom from setup to connected (or failed, or removed); its waits are checkpointed, so they cost no compute. */
export const watchCacheDeploymentTask = task({
	id: WATCH_CACHE_DEPLOYMENT_TASK_ID,
	run: async (raw: WatchCacheDeploymentPayload, { ctx: triggerCtx }) => {
		const { orgId, env, deploymentGroupId } =
			WatchCacheDeploymentPayloadSchema.parse(raw);
		const outcome = await runWithTriggerContext({
			orgId,
			env,
			triggerCtx,
			args: { deploymentGroupId, waitFor: wait.for },
			action: watchCacheDeployment,
		});
		// A finished watch frees its group's key, so the next create, retry or delete starts a new one.
		await idempotencyKeys.reset(
			WATCH_CACHE_DEPLOYMENT_TASK_ID,
			await cacheWatchIdempotencyKey({ deploymentGroupId }),
		);
		return { outcome };
	},
});

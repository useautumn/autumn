import { AppEnv } from "@autumn/shared";
import { idempotencyKeys, task, wait } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { cacheDeploymentAtomContext } from "@/internal/byoc/actions/lifecycle/cacheDeploymentAtomContext.js";
import { atomWatchIdempotencyKey } from "@/internal/byoc/atomRecords/watchAtomRecord/atomWatchIdempotencyKey.js";
import { watchAtomRecord } from "@/internal/byoc/atomRecords/watchAtomRecord/watchAtomRecord.js";
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
			action: ({ ctx, waitFor }) =>
				watchAtomRecord({
					ctx: cacheDeploymentAtomContext({ ctx, deploymentGroupId }),
					waitFor,
				}),
		});
		await idempotencyKeys.reset(
			WATCH_CACHE_DEPLOYMENT_TASK_ID,
			await atomWatchIdempotencyKey({ deploymentGroupId }),
		);
		return { outcome };
	},
});

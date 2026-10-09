import { tasks } from "@trigger.dev/sdk/v3";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { watchCacheDeploymentTask } from "@/trigger/atom/watchCacheDeploymentTask.js";
import { startAtomWatch } from "../../atomRecords/watchAtomRecord/startAtomWatch.js";

export const startCacheDeploymentWatch = ({
	ctx,
	deploymentGroupId,
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
}): Promise<void> =>
	startAtomWatch({
		ctx,
		deploymentGroupId,
		triggerWatch: ({ idempotencyKey }) =>
			tasks.trigger<typeof watchCacheDeploymentTask>(
				"watch-cache-deployment",
				{ orgId: ctx.org.id, env: ctx.env, deploymentGroupId },
				{ idempotencyKey },
			),
	});

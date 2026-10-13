import { tasks } from "@trigger.dev/sdk/v3";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { startAtomWatch } from "@/internal/byoc/atomRecords/watchAtomRecord/startAtomWatch.js";
import type { watchShadowAtomTask } from "@/trigger/atom/watchShadowAtomTask.js";

export const startShadowAtomWatch = ({
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
			tasks.trigger<typeof watchShadowAtomTask>(
				"watch-shadow-atom",
				{ deploymentGroupId },
				{ idempotencyKey },
			),
	});

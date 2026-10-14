import { runs } from "@trigger.dev/sdk/v3";
import "@/trigger/configureTrigger.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const TERMINAL_TRIGGER_STATUSES = new Set([
	"COMPLETED",
	"CANCELED",
	"FAILED",
	"CRASHED",
	"SYSTEM_FAILURE",
	"EXPIRED",
	"TIMED_OUT",
]);

export const isTriggerRunTerminal = async ({
	ctx,
	triggerRunId,
}: {
	ctx: AutumnContext;
	triggerRunId: string;
}): Promise<boolean> => {
	try {
		const triggerRun = await runs.retrieve(triggerRunId);
		return TERMINAL_TRIGGER_STATUSES.has(triggerRun.status);
	} catch (error) {
		ctx.logger.warn("migration-run: trigger liveness check failed", {
			data: {
				triggerRunId,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		return false;
	}
};

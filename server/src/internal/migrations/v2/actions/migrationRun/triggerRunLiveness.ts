import { runs } from "@trigger.dev/sdk/v3";
import "@/trigger/configureTrigger.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Trigger statuses after which the task can never execute another page. */
const TERMINAL_TRIGGER_STATUSES = new Set([
	"COMPLETED",
	"CANCELED",
	"FAILED",
	"CRASHED",
	"SYSTEM_FAILURE",
	"EXPIRED",
	"TIMED_OUT",
]);

/** Asks trigger.dev whether the task is provably dead. Unreachable API or a
 * non-terminal status → false (conservative: assume alive). */
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

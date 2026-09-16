import { runs } from "@trigger.dev/sdk/v3";

/** The trigger SDK mints run ids client-side, so `trigger()` can return a
 * handle for a task the platform never accepted. Reading the run back is the
 * only proof it was enqueued. */
export const verifyTriggerRunExists = async (
	triggerRunId: string,
): Promise<boolean> => {
	try {
		const run = await runs.retrieve(triggerRunId);
		return Boolean(run?.id);
	} catch {
		return false;
	}
};

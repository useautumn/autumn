import { runs } from "@trigger.dev/sdk/v3";

export type TriggerRunLookup = "found" | "not_found" | "inconclusive";

const isNotFound = (error: unknown): boolean => {
	const status =
		(error as { status?: number; statusCode?: number })?.status ??
		(error as { statusCode?: number })?.statusCode;
	if (status === 404) return true;
	const message = error instanceof Error ? error.message : String(error);
	return /not found/i.test(message);
};

/** The trigger SDK mints run ids client-side, so `trigger()` can return a
 * handle for a task the platform never accepted. Only a definite "not found"
 * proves that; a transport or 5xx failure leaves the dispatch unknown, and
 * failing the claim then could double-run a migration that did start. */
export const verifyTriggerRunExists = async (
	triggerRunId: string,
): Promise<TriggerRunLookup> => {
	try {
		const run = await runs.retrieve(triggerRunId);
		return run?.id ? "found" : "not_found";
	} catch (error) {
		return isNotFound(error) ? "not_found" : "inconclusive";
	}
};

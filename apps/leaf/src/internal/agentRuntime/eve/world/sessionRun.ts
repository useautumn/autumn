import { logger } from "../../../../lib/logger.js";
import {
	isWorldNotFoundError,
	workflowWorldHoldingRun,
} from "./workflowWorld.js";

/** False means eve no longer holds the delivery hook: a message post would
 * silently start a new run under the same token. */
export const isContinuationTokenAlive = async ({
	sessionId,
	token,
}: {
	sessionId: string;
	token: string;
}): Promise<boolean | undefined> => {
	const world = await workflowWorldHoldingRun(sessionId);
	if (!world) return undefined;
	try {
		await world.hooks.getByToken(token);
		return true;
	} catch (error) {
		if (isWorldNotFoundError(error)) return false;
		logger.error("Could not check whether the eve delivery hook is alive", {
			event: "leaf.eve_token_liveness_failed",
			data: { session_id: sessionId },
			error,
		});
		throw error;
	}
};

export const cancelSessionRun = async (sessionId: string) => {
	const world = await workflowWorldHoldingRun(sessionId);
	if (!world) return false;
	try {
		const run = await world.runs.get(sessionId, { resolveData: "none" });
		await world.events.create(sessionId, {
			eventType: "run_cancelled",
			specVersion: run.specVersion ?? 1,
		} as Parameters<typeof world.events.create>[1]);
		logger.info("Cancelled the eve run behind an abandoned session", {
			event: "leaf.eve_run_cancelled",
			data: { session_id: sessionId, spec_version: run.specVersion },
		});
		return true;
	} catch (error) {
		if (isWorldNotFoundError(error)) {
			logger.info("No eve run to cancel behind an abandoned session", {
				event: "leaf.eve_run_cancel_not_found",
				data: { session_id: sessionId },
			});
			return false;
		}
		logger.warn("Could not cancel the eve run behind an abandoned session", {
			event: "leaf.eve_run_cancel_failed",
			data: { session_id: sessionId },
			error,
		});
		return false;
	}
};

import { LISTENER_LOST_EXIT_CODE } from "../../../../agent/lib/workflowWorld/listenerLostExitCode.js";
import { logger } from "../../../lib/logger.js";
import { setEmbeddedEveStatus } from "./embeddedStatus.js";
import type { RestartBudget } from "./restartBudget.js";

/** Restarts eve when its world's LISTEN connection dies; any other exit ends leaf
 * so the task restarts. Once the budget is spent eve stays up on its local world. */
export const superviseEve = async ({
	start,
	budget,
	exitLeaf,
	sleep = Bun.sleep,
}: {
	start: (params: {
		allowDurable: boolean;
	}) => Promise<{ exited: Promise<number> }>;
	budget: RestartBudget;
	exitLeaf: (code: number) => Promise<void> | void;
	sleep?: (ms: number) => Promise<void>;
}) => {
	let allowDurable = true;
	while (true) {
		const eve = await start({ allowDurable });
		const code = await eve.exited;
		setEmbeddedEveStatus("down");
		if (code !== LISTENER_LOST_EXIT_CODE || !allowDurable) {
			await exitLeaf(code);
			return;
		}
		const delayMs = budget.nextDelayMs();
		if (delayMs === undefined) {
			logger.error(
				"eve world listener keeps dying; restart cap reached, serving on the local world",
				{ event: "leaf.eve_world_listener_restarts_exhausted" },
			);
			allowDurable = false;
			continue;
		}
		logger.warn("eve world listener died; restarting eve", {
			event: "leaf.eve_world_listener_lost",
			data: { delay_ms: delayMs },
		});
		await sleep(delayMs);
	}
};

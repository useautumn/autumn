import type { ActionEvent } from "chat";
import { logger } from "../../lib/logger.js";
import type { ActionMessageContent } from "../approvals/types.js";
import { getRun } from "./runRegistry.js";

/** Stop-button handler; action events bypass the thread lock, so this runs mid-handler. */
export const handleStopAction = async (event: ActionEvent) => {
	const runKey = event.value;
	if (!runKey) return;

	const editStopMessage = async (markdown: string) => {
		try {
			await event.adapter.editMessage?.(event.threadId, event.messageId, {
				markdown,
			} as ActionMessageContent);
		} catch {
			// The stop card may already have been deleted by run finalization.
		}
	};

	const run = getRun(runKey);
	if (!run) {
		await editStopMessage("_This run already finished._");
		return;
	}

	logger.info("Stop requested for run", {
		event: "leaf.run_stop_requested",
		data: { run_key: runKey, kind: run.kind },
	});
	await editStopMessage(`_Stopping — requested by <@${event.user.userId}>…_`);
	await run.requestStop({ byUserId: event.user.userId, reason: "user" });
};

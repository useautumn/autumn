import type { ActionEvent } from "chat";
import { logger } from "../../lib/logger.js";
import { RUN_ALREADY_FINISHED_MESSAGE } from "../../ui/messages.js";
import type { ActionMessageContent } from "../approvals/types.js";
import { getRun } from "./runRegistry.js";

export const handleStopAction = async (event: ActionEvent) => {
	const runKey = event.value;
	if (!runKey) return;

	const editStopMessage = async (markdown: string) => {
		try {
			await event.adapter.editMessage?.(event.threadId, event.messageId, {
				markdown,
			} as ActionMessageContent);
		} catch {
		}
	};

	const run = getRun(runKey);
	if (!run) {
		await editStopMessage(RUN_ALREADY_FINISHED_MESSAGE);
		return;
	}

	logger.info("Stop requested for run", {
		event: "leaf.run_stop_requested",
		data: { run_key: runKey, kind: run.kind },
	});
	await editStopMessage(`_Stopping — requested by <@${event.user.userId}>…_`);
	await run.requestStop({ byUserId: event.user.userId, reason: "user" });
};

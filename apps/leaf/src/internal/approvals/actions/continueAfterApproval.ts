import { type ChatApproval, chatInstallations } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../../../lib/db.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import { runSlackAgentTurn } from "../../../providers/slack/actions/runSlackAgentTurn.js";
import { presentSlackAgentTurn } from "../../../providers/slack/presenters/presentSlackAgentTurn.js";
import type { ReplyTarget } from "../../../ui/progress.js";

/** The write ran outside the agent's turn, so its response has to be handed
 * back for the completion reply (links, invoice status, failures). */
const appliedNotice = (result: unknown) =>
	[
		"<approval_applied>",
		"The change you proposed was approved and applied. This is its result:",
		JSON.stringify(result ?? {}),
		"Reply per the billing skill's completion response, then carry out any",
		"remaining steps of the original request.",
		"</approval_applied>",
	].join("\n");

/** A fresh turn confirms the applied change and finishes any remaining steps
 * of a multi-step request. */
export const continueAfterApproval = async ({
	approval,
	providerUserId,
	result,
	target,
	threadId,
}: {
	approval: ChatApproval;
	providerUserId: string;
	result: unknown;
	target: ReplyTarget;
	threadId: string;
}) => {
	try {
		const installation = await db.query.chatInstallations.findFirst({
			where: and(
				eq(chatInstallations.org_id, approval.org_id),
				eq(chatInstallations.provider, approval.provider),
				eq(chatInstallations.workspace_id, approval.workspace_id),
			),
		});
		if (!installation) return;
		const output = await runSlackAgentTurn({
			channelId: approval.channel_id,
			installation,
			providerUserId,
			text: appliedNotice(result),
			threadId,
		});
		// Neither is presentable, and neither can happen on a turn nobody drives.
		if (output.kind === "blocked" || output.kind === "stopped") return;
		await presentSlackAgentTurn({
			channelId: approval.channel_id,
			logAction: () => undefined,
			logger: rootLogger,
			providerUserId,
			stopStatus: () => undefined,
			target,
			threadId,
			turn: output,
		});
	} catch (error) {
		rootLogger.warn("Could not continue after approval", {
			event: "leaf.approval_continue_failed",
			approval_id: approval.id,
			error,
		});
	}
};

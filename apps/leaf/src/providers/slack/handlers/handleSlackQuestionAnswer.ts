import type { ActionEvent } from "chat";
import { answerAgentQuestion } from "../../../internal/agentRuntime/actions/answerAgentQuestion/answerAgentQuestion.js";
import { chatApprovalRepo } from "../../../internal/approvals/repos/chatApprovalRepo.js";
import { postApprovalCardForRow } from "../../../internal/approvals/surfaces/slack/present.js";
import { db } from "../../../lib/db.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import {
	QUESTION_ANSWER_FAILED_MESSAGE,
	questionAnswerFailedWithDetail,
} from "../../../ui/messages.js";
import { getSlackWorkspaceId } from "../context.js";
import { findSlackInstallationForWorkspace } from "../installations.js";
import {
	parseQuestionButtonPayload,
	questionAnsweredCard,
	questionCard,
} from "../presenters/interactionCards.js";

export const handleSlackQuestionAnswer = async (event: ActionEvent) => {
	const payload = parseQuestionButtonPayload(event.value);
	if (!payload) return;
	const workspaceId = getSlackWorkspaceId(event.raw);
	const installation = await findSlackInstallationForWorkspace({ workspaceId });
	if (!installation) return;
	const providerUserId = event.user.userId;

	try {
		await event.adapter.editMessage?.(
			event.threadId,
			event.messageId,
			questionAnsweredCard({
				actorId: providerUserId,
				answerLabel: payload.l,
				prompt: payload.q,
			}),
		);
	} catch {}
	try {
		await event.thread?.startTyping("Working on it...");
	} catch {}

	try {
		const result = await answerAgentQuestion({
			auth: {
				appEnv: payload.e,
				channelId: event.thread?.channelId ?? event.threadId,
				orgId: payload.g,
				provider: installation.provider,
				providerUserId,
				threadId: event.threadId,
				workspaceId: installation.workspace_id,
			},
			optionId: payload.o,
			orgId: payload.g,
			requestId: payload.r,
			sessionId: payload.s,
		});
		if ("error" in result) {
			await event.thread?.post({
				markdown: questionAnswerFailedWithDetail(result.message),
			});
			return;
		}
		if (result.text.trim()) {
			await event.thread?.post({ markdown: result.text });
		}
		if (result.question) {
			await event.thread?.post(
				questionCard({
					env: payload.e,
					options: result.question.options,
					orgId: payload.g,
					prompt: result.question.prompt,
					requestId: result.question.requestId,
					sessionId: result.sessionId,
				}),
			);
		}
		if (result.chainedApprovalId && event.thread) {
			const chained = await chatApprovalRepo.get({
				approvalId: result.chainedApprovalId,
				db,
			});
			if (chained) {
				await postApprovalCardForRow({
					approval: chained,
					target: event.thread,
				});
			}
		}
	} catch (error) {
		rootLogger.error("[chat] Question answer failed", error, {
			event: "leaf.eve_question_answer_failed",
		});
		await event.thread?.post({ markdown: QUESTION_ANSWER_FAILED_MESSAGE });
	}
};

import type { AutumnLogger } from "@autumn/logging";
import { buildCatalogDecisionModel } from "@autumn/render";
import {
	type ResolvedAgentCatalogDecision,
	resolveAgentCatalogDecision,
} from "../../../internal/agentRuntime/actions/resolveCatalogDecision/resolveAgentCatalogDecision.js";
import { presentApproval } from "../../../internal/approvals/surfaces/slack/present.js";
import { getInstallationOAuthAccessToken } from "../../../internal/installations/actions/getInstallationOAuthAccessToken.js";
import { NO_REPLY_MESSAGE } from "../../../ui/messages.js";
import type { ReplyTarget } from "../../../ui/progress.js";
import type { SlackAgentTurnResult } from "../domain/slackAgentTurn.js";
import { catalogDecisionCard, questionCard } from "./interactionCards.js";

type PresentableSlackAgentTurn = Exclude<
	SlackAgentTurnResult,
	{ kind: "blocked" | "stopped" }
>;

export const presentSlackAgentTurn = async ({
	channelId,
	clientContext,
	logAction,
	logger,
	isStopped,
	providerUserId,
	stopStatus,
	target,
	threadId,
	turn,
}: {
	channelId: string;
	clientContext?: Readonly<Record<string, unknown>>;
	logAction: (message: string) => Promise<void> | void;
	logger: AutumnLogger;
	providerUserId: string;
	isStopped?: () => boolean;
	stopStatus: () => void;
	target: ReplyTarget;
	threadId: string;
	turn: PresentableSlackAgentTurn;
}): Promise<"posted" | "stopped"> => {
	const outputText = turn.kind === "empty" ? "" : turn.text;
	const { installation, org } = turn;
	let catalogDecision: ResolvedAgentCatalogDecision | undefined;
	try {
		if (turn.kind === "approval") {
			logAction("Reviewing versioning impact");
		}
		catalogDecision = await resolveAgentCatalogDecision({
			decisionProvided: Boolean(clientContext?.catalogDecision),
			env: turn.env,
			getToken: () =>
				getInstallationOAuthAccessToken({
					installation,
					env: turn.env,
					orgId: org.id,
				}),
			logger,
			orgId: org.id,
			providerUserId,
			thread: {
				channelId,
				provider: installation.provider,
				threadId,
				workspaceId: installation.workspace_id,
			},
			turn,
		});
	} catch (error) {
		logger.warn("Could not evaluate catalog decision redirect", {
			event: "leaf.eve_catalog_redirect_failed",
			error,
		});
	}

	stopStatus();
	if (isStopped?.()) return "stopped";

	if (catalogDecision) {
		if (outputText.trim()) {
			await target.post({ markdown: outputText });
		}
		await target.post(
			catalogDecisionCard({
				env: turn.env,
				model: buildCatalogDecisionModel({ plan: catalogDecision.plan }),
				orgId: org.id,
				plan: catalogDecision.plan,
			}),
		);
		return "posted";
	}

	if (turn.kind === "question") {
		await target.post(
			questionCard({
				env: turn.env,
				options: turn.question.options,
				orgId: org.id,
				prompt: turn.question.prompt,
				requestId: turn.question.requestId,
				sessionId: turn.sessionId,
			}),
		);
		return "posted";
	}

	if (turn.kind === "approval") {
		const presented = await presentApproval({
			channelId,
			env: turn.env,
			installation,
			isStopped,
			logAction,
			logger,
			orgId: org.id,
			providerUserId,
			target,
			turn,
		});
		if (presented === "stopped") return "stopped";
		if (presented === "posted") return "posted";
	}

	if (!outputText.trim()) {
		await target.post({ markdown: `:warning: ${NO_REPLY_MESSAGE}` });
		logger.warn("Agent produced no reply", {
			event: "leaf.slack_empty_response",
			data: {
				kind: turn.kind,
				run_id: turn.sessionId,
			},
		});
		return "posted";
	}

	await target.post({ markdown: outputText });
	logger.info("Posted Slack response", {
		event: "leaf.slack_response_posted",
		data: {
			has_text: true,
		},
	});
	return "posted";
};

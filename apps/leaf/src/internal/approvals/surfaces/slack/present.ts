import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval, ChatInstallation } from "@autumn/shared";
import { db } from "../../../../lib/db.js";
import { logger as rootLogger } from "../../../../lib/logger.js";
import { approvalCard, approvalSheetUrl } from "../../../../ui/blocks.js";
import type { ReplyTarget } from "../../../../ui/progress.js";
import type { AgentApprovalTurn } from "../../../agentRuntime/domain/agentTurn.js";
import type { WithheldWrite } from "../../../agentRuntime/eve/parkedInput.js";
import { toolLabel } from "../../../agentRuntime/tools/toolPolicy.js";
import { getInstallationOAuthAccessToken } from "../../../installations/actions/getInstallationOAuthAccessToken.js";
import { createApproval } from "../../actions/createApproval.js";
import {
	dashboardLinkableApproval,
	withheldStepsOf,
} from "../../domain/approvalRecord.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";
import { chatApprovalStepsRepo } from "../../repos/chatApprovalStepsRepo.js";
import { publicToolArgs } from "../../utils/toolRequest.js";

const requestField = (
	toolArgs: Record<string, unknown> | undefined,
	key: string,
) => {
	const request = toolArgs?.request;
	const value =
		request && typeof request === "object"
			? (request as Record<string, unknown>)[key]
			: toolArgs?.[key];
	return typeof value === "string" ? value : undefined;
};

const dashboardUrlFor = ({
	approvalId,
	env,
	groupedStepCount,
	provider,
	toolArgs,
	toolName,
}: {
	approvalId: string;
	env: ChatApproval["env"];
	groupedStepCount: number;
	provider: string;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}) =>
	dashboardLinkableApproval({
		approval: {
			provider: provider as ChatApproval["provider"],
			tool_args: toolArgs ?? {},
			tool_name: toolName,
		},
		groupedStepCount,
	})
		? approvalSheetUrl({
				approvalId,
				customerId: requestField(toolArgs, "customer_id"),
				env,
				planId: requestField(toolArgs, "plan_id"),
				toolName,
			})
		: undefined;

export const postApprovalCardForRow = async ({
	approval,
	logger = rootLogger,
	target,
}: {
	approval: ChatApproval;
	logger?: AutumnLogger;
	/** Structural post-only view so ActionEvent threads (unknown state generic) fit. */
	target: { post: (message: unknown) => Promise<{ id: string }> };
}) => {
	const toolArgs =
		approval.tool_args && typeof approval.tool_args === "object"
			? (approval.tool_args as Record<string, unknown>)
			: {};
	const steps = await chatApprovalStepsRepo.list({
		approvalId: approval.id,
		db,
	});
	const grouped = withheldStepsOf({ approval, steps });
	const sent = await target.post(
		approvalCard({
			dashboardUrl: dashboardUrlFor({
				approvalId: approval.id,
				env: approval.env,
				groupedStepCount: grouped.length,
				provider: approval.provider,
				toolArgs,
				toolName: approval.tool_name,
			}),
			id: approval.id,
			env: approval.env,
			preview: approval.preview ?? undefined,
			steps: grouped,
			toolArgs: publicToolArgs(toolArgs),
			toolName: approval.tool_name,
		}),
	);
	try {
		await chatApprovalRepo.setMessageTs({
			approvalId: approval.id,
			db,
			messageTs: sent.id,
		});
	} catch (error) {
		logger.warn("Could not store chained approval message id", {
			event: "leaf.approval_message_ts_failed",
			approval_id: approval.id,
			error,
		});
	}
};

/** Grouped step previews land after the card is already visible; once they
 * persist, the card re-renders — unless the approval resolved meanwhile, whose
 * card must not be overwritten. */
const renderBackfilledGroupCard = async ({
	backfill,
	channelId,
	created,
	env,
	logger,
	messageId,
	target,
}: {
	backfill: () => Promise<ReadonlyArray<WithheldWrite> | undefined>;
	channelId: string;
	created: {
		approvalId: string;
		dashboardUrl?: string | null;
		preview: unknown;
		toolArgs: Record<string, unknown>;
		toolName: string;
	};
	env: ChatApproval["env"];
	logger: AutumnLogger;
	messageId: string;
	target: ReplyTarget;
}) => {
	try {
		const previewedSteps = await backfill();
		if (!previewedSteps) return;
		if (!target.adapter?.editMessage) {
			logger.warn("No adapter to re-render the backfilled card", {
				event: "leaf.approval_group_preview_render_skipped",
				approval_id: created.approvalId,
			});
			return;
		}
		const current = await chatApprovalRepo.get({
			approvalId: created.approvalId,
			db,
		});
		if (current?.status !== "pending") return;
		await target.adapter.editMessage(
			channelId,
			messageId,
			approvalCard({
				dashboardUrl: created.dashboardUrl,
				id: created.approvalId,
				env,
				preview: created.preview,
				steps: previewedSteps,
				toolArgs: created.toolArgs,
				toolName: created.toolName,
			}),
		);
	} catch (error) {
		logger.warn("Could not backfill grouped previews", {
			event: "leaf.approval_group_preview_backfill_failed",
			approval_id: created.approvalId,
			error,
		});
	}
};

export const presentApproval = async ({
	channelId,
	installation,
	logAction,
	logger = rootLogger,
	orgId,
	env,
	providerUserId,
	target,
	turn,
}: {
	channelId: string;
	env: ChatApproval["env"];
	installation: ChatInstallation;
	logAction: (message: string) => Promise<void> | void;
	logger?: AutumnLogger;
	orgId: string;
	providerUserId: string;
	target: ReplyTarget;
	turn: AgentApprovalTurn;
}) => {
	const created = await createApproval({
		channelId,
		env,
		getToken: () =>
			getInstallationOAuthAccessToken({ installation, env, orgId }),
		logger,
		orgId,
		provider: installation.provider,
		providerUserId,
		turn,
		workspaceId: installation.workspace_id,
	});
	if (!created) return false;

	await logAction(`Waiting for approval: ${toolLabel(created.toolName)}`);
	const dashboardUrl = dashboardUrlFor({
		approvalId: created.approvalId,
		env,
		groupedStepCount: created.withheld.length,
		provider: installation.provider,
		toolArgs: created.toolArgs,
		toolName: created.toolName,
	});
	const sent = await target.post(
		approvalCard({
			dashboardUrl,
			id: created.approvalId,
			env,
			preview: created.preview,
			steps: created.withheld,
			toolArgs: created.toolArgs,
			toolName: created.toolName,
		}),
	);

	try {
		await chatApprovalRepo.setMessageTs({
			approvalId: created.approvalId,
			db,
			messageTs: sent.id,
		});
	} catch (error) {
		logger.warn("Could not store approval message id", {
			event: "leaf.approval_message_ts_failed",
			approval_id: created.approvalId,
			error,
		});
	}
	if (created.backfillGroupedPreviews) {
		void renderBackfilledGroupCard({
			backfill: created.backfillGroupedPreviews,
			channelId,
			created: { ...created, dashboardUrl },
			env,
			logger,
			messageId: sent.id,
			target,
		});
	}
	return true;
};

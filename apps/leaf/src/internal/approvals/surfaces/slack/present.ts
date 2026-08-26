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
	withheldWritesOf,
} from "../../domain/approvalRecord.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";
import { chatApprovalWritesRepo } from "../../repos/chatApprovalWritesRepo.js";
import { publicToolArgs, requestStringField } from "../../utils/toolRequest.js";

/** URL only for cards the dashboard sheet can actually open. */
export const dashboardUrlFor = ({
	approvalId,
	env,
	groupedStepCount,
	orgId,
	provider,
	toolArgs,
	toolName,
}: {
	approvalId: string;
	env: ChatApproval["env"];
	groupedStepCount: number;
	orgId: string;
	provider: string;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}) =>
	dashboardLinkableApproval({
		approval: {
			provider,
			tool_args: toolArgs ?? {},
			tool_name: toolName,
		},
		groupedStepCount,
	})
		? approvalSheetUrl({
				approvalId,
				customerId: requestStringField(toolArgs, "customer_id"),
				env,
				orgId,
				planId: requestStringField(toolArgs, "plan_id"),
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
	target: { post: (message: unknown) => Promise<{ id: string }> };
}) => {
	const toolArgs =
		approval.tool_args && typeof approval.tool_args === "object"
			? (approval.tool_args as Record<string, unknown>)
			: {};
	const writes = await chatApprovalWritesRepo.list({
		approvalId: approval.id,
		db,
	});
	const grouped = withheldWritesOf({ approval, writes });
	const sent = await target.post(
		approvalCard({
			dashboardUrl: dashboardUrlFor({
				approvalId: approval.id,
				env: approval.env,
				groupedStepCount: grouped.length,
				orgId: approval.org_id,
				provider: approval.provider,
				toolArgs,
				toolName: approval.tool_name,
			}),
			id: approval.id,
			env: approval.env,
			preview: approval.preview ?? undefined,
			writes: grouped,
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

/** Re-renders the card once backfilled previews persist — unless the approval
 * resolved meanwhile, whose card must not be overwritten. */
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
				writes: previewedSteps,
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
		orgId,
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
			writes: created.withheld,
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

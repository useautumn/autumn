import { parsePreviewPayload } from "@autumn/render";
import {
	type ApprovalDetail,
	type ApprovalDetailError,
	type ApprovalDetailStep,
	type ChatApproval,
	type ChatApprovalStep,
	member,
	organizations,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { normalizeToolName } from "../../../internal/agentRuntime/tools/toolPolicy.js";
import {
	allWritesOf,
	dashboardLinkableApproval,
} from "../../../internal/approvals/domain/approvalRecord.js";
import { summarizeStepResult } from "../../../internal/approvals/domain/stepResultSummary.js";
import { chatApprovalRepo } from "../../../internal/approvals/repos/chatApprovalRepo.js";
import { chatApprovalStepsRepo } from "../../../internal/approvals/repos/chatApprovalStepsRepo.js";
import {
	publicToolArgs,
	toolRequestFromArgs,
} from "../../../internal/approvals/utils/toolRequest.js";
import { db } from "../../../lib/db.js";

export type GetWebApprovalResult =
	| { approval: ApprovalDetail }
	| { error: ApprovalDetailError };

const requestString = (approval: ChatApproval, key: string): string | null => {
	const request = toolRequestFromArgs(approval.tool_args);
	const value = request?.[key];
	return typeof value === "string" ? value : null;
};

const stepFromRow = (step: ChatApprovalStep): ApprovalDetailStep => {
	const summary =
		step.status === "applied" || step.status === "failed"
			? summarizeStepResult(step.result)
			: null;
	return {
		error: step.status === "failed" ? (summary?.message ?? null) : null,
		id: step.id,
		links: summary?.links ?? [],
		params: publicToolArgs(step.tool_args, { includeWithheld: false }),
		position: step.position,
		preview: parsePreviewPayload(step.preview) ?? step.preview,
		status: step.status,
		tool_name: step.tool_name,
	};
};

/** Legacy rows (pre step-table) synthesize steps from the parent + markers. */
const legacySteps = (approval: ChatApproval): ApprovalDetailStep[] => {
	const primaryStatus =
		approval.status === "approved"
			? "applied"
			: approval.status === "failed"
				? "failed"
				: approval.status === "cancelled"
					? "skipped"
					: "pending";
	return allWritesOf({ approval }).map((write, position) => ({
		error: null,
		id: `${approval.id}:${position}`,
		links: [],
		params: publicToolArgs(write.input ?? {}, { includeWithheld: false }),
		position,
		preview: parsePreviewPayload(write.preview) ?? write.preview ?? null,
		status: position === 0 ? primaryStatus : "unknown",
		tool_name: write.toolName,
	}));
};

/** Only when the session user is a member of the owning org may the response
 * name it — an approval id must never become a cross-tenant oracle. */
const switchTargetFor = async ({
	orgId,
	userId,
}: {
	orgId: string;
	userId?: string;
}) => {
	if (!userId) return undefined;
	const [row] = await db
		.select({ id: organizations.id, name: organizations.name })
		.from(member)
		.innerJoin(organizations, eq(organizations.id, member.organizationId))
		.where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
		.limit(1);
	return row ?? undefined;
};

export const getWebApproval = async ({
	approvalId,
	orgId,
	userId,
}: {
	approvalId: string;
	orgId: string;
	userId?: string;
}): Promise<GetWebApprovalResult> => {
	const approval = await chatApprovalRepo.get({ approvalId, db });
	if (!approval) return { error: { code: "not_found" } };
	if (approval.org_id !== orgId) {
		return {
			error: {
				code: "org_mismatch",
				switch_to_org: await switchTargetFor({
					orgId: approval.org_id,
					userId,
				}),
			},
		};
	}

	const stepRows = await chatApprovalStepsRepo.list({ approvalId, db });
	const steps = stepRows.length
		? stepRows.map(stepFromRow)
		: legacySteps(approval);
	const expired =
		approval.status === "pending" && approval.expires_at <= Date.now();
	const toolName = normalizeToolName(approval.tool_name);

	return {
		approval: {
			can_apply:
				approval.status === "pending" &&
				!expired &&
				dashboardLinkableApproval({
					approval,
					groupedStepCount: steps.length - 1,
				}),
			created_at: approval.created_at,
			customer_id: requestString(approval, "customer_id"),
			decided_at: approval.decided_at,
			decided_by_provider_user_id: approval.decided_by_provider_user_id,
			env: approval.env,
			expires_at: approval.expires_at,
			id: approval.id,
			plan_id: requestString(approval, "plan_id"),
			provider: approval.provider,
			status: expired ? "expired" : approval.status,
			steps,
			tool_name: toolName,
		},
	};
};

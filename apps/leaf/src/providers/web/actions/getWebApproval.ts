import type {
	ApprovalDetail,
	ApprovalDetailError,
	ApprovalDetailStep,
	ChatApproval,
} from "@autumn/shared";
import { normalizeToolName } from "../../../internal/agentRuntime/tools/toolPolicy.js";
import { allWritesOf } from "../../../internal/approvals/domain/approvalRecord.js";
import { chatApprovalRepo } from "../../../internal/approvals/repos/chatApprovalRepo.js";
import { chatApprovalStepsRepo } from "../../../internal/approvals/repos/chatApprovalStepsRepo.js";
import {
	publicToolArgs,
	requestStringField,
} from "../../../internal/approvals/utils/toolRequest.js";
import { db } from "../../../lib/db.js";

export type GetWebApprovalResult =
	| { approval: ApprovalDetail }
	| { error: ApprovalDetailError };

/** Legacy rows (pre step-table) synthesize steps from the parent + markers. */
const legacySteps = (approval: ChatApproval): ApprovalDetailStep[] =>
	allWritesOf({ approval }).map((write) => ({
		params: publicToolArgs(write.input ?? {}, { includeWithheld: false }),
	}));

export const getWebApproval = async ({
	approvalId,
	orgId,
}: {
	approvalId: string;
	orgId: string;
}): Promise<GetWebApprovalResult> => {
	const approval = await chatApprovalRepo.get({ approvalId, db });
	if (!approval) return { error: { code: "not_found" } };
	if (approval.org_id !== orgId) {
		// A bare code: an approval id must never become a cross-tenant oracle.
		return { error: { code: "org_mismatch" } };
	}

	const stepRows = await chatApprovalStepsRepo.list({ approvalId, db });
	const steps = stepRows.length
		? stepRows.map((step) => ({
				params: publicToolArgs(step.tool_args, { includeWithheld: false }),
			}))
		: legacySteps(approval);

	return {
		approval: {
			id: approval.id,
			plan_id:
				requestStringField(
					approval.tool_args as Record<string, unknown>,
					"plan_id",
				) ?? null,
			steps,
			tool_name: normalizeToolName(approval.tool_name),
		},
	};
};

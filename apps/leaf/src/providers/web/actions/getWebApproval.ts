import type {
	ApprovalDetail,
	ApprovalDetailError,
	ApprovalDetailWrite,
	ChatApproval,
} from "@autumn/shared";
import { normalizeToolName } from "../../../internal/agentRuntime/tools/toolPolicy.js";
import { allWritesOf } from "../../../internal/approvals/domain/approvalRecord.js";
import { chatApprovalRepo } from "../../../internal/approvals/repos/chatApprovalRepo.js";
import { chatApprovalWritesRepo } from "../../../internal/approvals/repos/chatApprovalWritesRepo.js";
import {
	publicToolArgs,
	requestStringField,
} from "../../../internal/approvals/utils/toolRequest.js";
import { db } from "../../../lib/db.js";

export type GetWebApprovalResult =
	| { approval: ApprovalDetail }
	| { error: ApprovalDetailError };

/** Legacy rows (pre write-table) synthesize writes from the parent + markers. */
const legacyWrites = (approval: ChatApproval): ApprovalDetailWrite[] =>
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

	const writeRows = await chatApprovalWritesRepo.list({ approvalId, db });
	const writes = writeRows.length
		? writeRows.map((write) => ({
				params: publicToolArgs(write.tool_args, { includeWithheld: false }),
			}))
		: legacyWrites(approval);

	return {
		approval: {
			id: approval.id,
			plan_id:
				requestStringField(
					approval.tool_args as Record<string, unknown>,
					"plan_id",
				) ?? null,
			writes,
			tool_name: normalizeToolName(approval.tool_name),
		},
	};
};

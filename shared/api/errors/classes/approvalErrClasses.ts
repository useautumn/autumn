import type { ApprovalVerdict } from "../../approvals/evaluate/types/approvalVerdict.js";
import { RecaseError } from "../base/RecaseError.js";
import { ApprovalErrorCode } from "../codes/approvalErrCodes.js";

type DenyVerdict = Extract<ApprovalVerdict, { verdict: "deny" }>;

/** An approval rule blocked this write. `details` says which conditions matched and who could do it. */
export class PermissionDeniedError extends RecaseError {
	constructor({ verdict }: { verdict: DenyVerdict }) {
		super({
			message: verdict.message,
			code: ApprovalErrorCode.PermissionDenied,
			statusCode: 403,
			details: {
				violations: verdict.violations,
				decided_by: verdict.decided_by,
				allowed_roles: verdict.allowed_roles,
			},
		});
		this.name = "PermissionDeniedError";
	}
}

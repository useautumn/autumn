import { ErrCode } from "../../../enums/ErrCode.js";
import type {
	ApprovalDecidedBy,
	ApprovalViolation,
} from "../../approvals/evaluate/types/approvalVerdict.js";
import { RecaseError } from "../base/RecaseError.js";

/** The approval rules denied this request; the body says what failed and who can do it. */
export class PermissionDeniedError extends RecaseError {
	/** Spread into the 403 body beside `code` and `message`, as approvals §3 defines it. */
	body: {
		violations: ApprovalViolation[];
		decided_by: ApprovalDecidedBy;
		allowed_roles: string[];
	};

	constructor(opts: {
		message: string;
		violations: ApprovalViolation[];
		decided_by: ApprovalDecidedBy;
		allowed_roles: string[];
	}) {
		super({
			message: opts.message,
			code: ErrCode.PermissionDenied,
			statusCode: 403,
		});
		this.name = "PermissionDeniedError";
		this.body = {
			violations: opts.violations,
			decided_by: opts.decided_by,
			allowed_roles: opts.allowed_roles,
		};
	}
}

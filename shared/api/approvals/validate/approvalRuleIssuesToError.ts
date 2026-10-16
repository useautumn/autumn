import { ErrCode } from "../../../enums/ErrCode";
import { RecaseError } from "../../errors/base/RecaseError";
import type { ApprovalRuleIssue } from "./types";

/** The 400 every rule write returns for validator issues, with them under `details.issues`. */
export const approvalRuleIssuesToError = ({
	issues,
}: {
	issues: ApprovalRuleIssue[];
}) =>
	new RecaseError({
		message: issues[0]?.message ?? "This rule isn't valid.",
		code: ErrCode.InvalidApprovalRule,
		statusCode: 400,
		details: { issues },
	});

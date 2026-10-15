import type { ApprovalRuleIssue } from "@autumn/shared";
import { AxiosError } from "axios";

type InvalidRuleBody = { code?: string; issues?: ApprovalRuleIssue[] };

/** The server's 400 `invalid_approval_rule` issues, or null for any other error. */
export const invalidRuleIssues = ({ error }: { error: unknown }) => {
	if (!(error instanceof AxiosError)) return null;
	const body = error.response?.data as InvalidRuleBody | undefined;
	if (body?.code !== "invalid_approval_rule") return null;
	return body.issues ?? [];
};

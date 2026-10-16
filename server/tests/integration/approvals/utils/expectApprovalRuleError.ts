import { expect } from "bun:test";
import type { ApprovalRuleErrorBody } from "./approvalRulesApi.js";

/** Asserts the error envelope: code at the top, any rule issues under `details.issues`. */
export const expectApprovalRuleError = ({
	res,
	status,
	code,
	issuePaths,
}: {
	res: { status: number; data: unknown };
	status: number;
	code: string;
	issuePaths?: string[];
}) => {
	const body = res.data as ApprovalRuleErrorBody & { issues?: unknown };
	expect(res.status).toBe(status);
	expect(body.code).toBe(code);
	expect(body.issues).toBeUndefined();
	if (issuePaths)
		expect(body.details?.issues?.map((issue) => issue.path)).toEqual(
			issuePaths,
		);
};

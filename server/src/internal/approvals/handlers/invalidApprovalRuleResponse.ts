import type { ApprovalRuleIssue } from "@autumn/shared";
import type { Context } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

/** §2's validation error: 400 with one `issues` entry per problem, at the top level. */
export const invalidApprovalRuleResponse = ({
	c,
	issues,
}: {
	c: Context<HonoEnv>;
	issues: ApprovalRuleIssue[];
}) =>
	c.json(
		{
			code: "invalid_approval_rule",
			message:
				"This rule can't be saved. Fix the listed problems and try again.",
			issues,
		},
		400,
	);

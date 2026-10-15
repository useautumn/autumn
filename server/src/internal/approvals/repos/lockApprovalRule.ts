import type { AppEnv } from "@autumn/shared";
import { approvalRules } from "@autumn/shared/models/approvalModels/index";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Row-locks a rule for the rest of the caller's transaction, so concurrent edits queue. */
export const lockApprovalRule = async ({
	db,
	orgId,
	env,
	ruleId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	ruleId: string;
}) => {
	await db
		.select({ id: approvalRules.id })
		.from(approvalRules)
		.where(
			and(
				eq(approvalRules.id, ruleId),
				eq(approvalRules.org_id, orgId),
				eq(approvalRules.env, env),
			),
		)
		.for("update");
};

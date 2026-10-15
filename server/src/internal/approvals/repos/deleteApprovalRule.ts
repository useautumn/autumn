import type { AppEnv } from "@autumn/shared";
import { approvalRules } from "@autumn/shared/models/approvalModels/index";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Deletes a rule and, by cascade, its subjects; its versions stay for History. Returns whether it existed. */
export const deleteApprovalRule = async ({
	db,
	orgId,
	env,
	ruleId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	ruleId: string;
}): Promise<boolean> => {
	const deleted = await db
		.delete(approvalRules)
		.where(
			and(
				eq(approvalRules.id, ruleId),
				eq(approvalRules.org_id, orgId),
				eq(approvalRules.env, env),
			),
		)
		.returning({ id: approvalRules.id });

	return deleted.length > 0;
};

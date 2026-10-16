import { approvalRuleSubjects } from "@autumn/shared/models/approvalModels/index";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** A removed member's rules should stop naming them; the rules themselves stay. */
export const deleteMemberRuleSubjects = async ({
	db,
	orgId,
	userId,
}: {
	db: DrizzleCli;
	orgId: string;
	userId: string;
}) => {
	await db
		.delete(approvalRuleSubjects)
		.where(
			and(
				eq(approvalRuleSubjects.org_id, orgId),
				eq(approvalRuleSubjects.subject_type, "user"),
				eq(approvalRuleSubjects.subject_id, userId),
			),
		);
};

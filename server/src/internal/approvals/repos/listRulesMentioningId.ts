import {
	type ApprovalRuleRow,
	approvalRules,
} from "@autumn/shared/models/approvalModels/index";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Rules whose `filter` contains `id` as a JSON string anywhere, row-locked for the caller's transaction. */
export const listRulesMentioningId = async ({
	db,
	orgId,
	id,
}: {
	db: DrizzleCli;
	orgId: string;
	id: string;
}): Promise<ApprovalRuleRow[]> =>
	db
		.select()
		.from(approvalRules)
		.where(
			and(
				eq(approvalRules.org_id, orgId),
				sql`jsonb_path_exists(${approvalRules.filter}, '$.** ? (@ == $id)', jsonb_build_object('id', ${id}::text))`,
			),
		)
		.for("update");

import {
	approvalDecisions,
	type InsertApprovalDecision,
} from "@autumn/shared/models/approvalModels/index";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const insertApprovalDecision = async ({
	db,
	decision,
}: {
	db: DrizzleCli;
	decision: InsertApprovalDecision;
}) => {
	await db.insert(approvalDecisions).values(decision);
};

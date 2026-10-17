import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Serializes position changes for one org until the caller's transaction ends. */
export const lockOrgApprovalRules = async ({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}) => {
	await db.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${`approval_rules:${orgId}`}, 0))`,
	);
};

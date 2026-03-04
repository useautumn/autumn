import {
	autoTopupLimitStates,
	type InsertAutoTopupLimitState,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const insertAutoTopupLimit = async ({
	ctx,
	data,
}: {
	ctx: AutumnContext;
	data: Omit<InsertAutoTopupLimitState, "org_id" | "env">;
}) => {
	const { db, org, env } = ctx;
	const inserted = await db
		.insert(autoTopupLimitStates)
		.values({
			...data,
			org_id: org.id,
			env,
		})
		.onConflictDoNothing()
		.returning();

	return inserted[0] ?? null;
};

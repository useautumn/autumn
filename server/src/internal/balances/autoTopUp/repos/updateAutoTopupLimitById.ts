import {
	autoTopupLimitStates,
	type InsertAutoTopupLimitState,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const updateAutoTopupLimitById = async ({
	ctx,
	id,
	updates,
}: {
	ctx: AutumnContext;
	id: string;
	updates: Partial<InsertAutoTopupLimitState>;
}) => {
	if (Object.keys(updates).length === 0) return;

	const { db, org, env } = ctx;
	await db
		.update(autoTopupLimitStates)
		.set(updates)
		.where(
			and(
				eq(autoTopupLimitStates.id, id),
				eq(autoTopupLimitStates.org_id, org.id),
				eq(autoTopupLimitStates.env, env),
			),
		);
};

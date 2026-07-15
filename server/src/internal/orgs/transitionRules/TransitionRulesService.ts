import {
	type AppEnv,
	type TransitionRuleCarryOverUsages,
	type TransitionRuleRow,
	transitionRules,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export class TransitionRulesService {
	static async get({
		db,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
	}): Promise<TransitionRuleRow | undefined> {
		const [row] = await db
			.select()
			.from(transitionRules)
			.where(
				and(eq(transitionRules.org_id, orgId), eq(transitionRules.env, env)),
			)
			.limit(1);
		return row;
	}

	static async upsert({
		db,
		orgId,
		env,
		carryOverUsages,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		carryOverUsages: TransitionRuleCarryOverUsages | null;
	}): Promise<TransitionRuleRow> {
		const [row] = await db
			.insert(transitionRules)
			.values({
				org_id: orgId,
				env,
				carry_over_usages: carryOverUsages,
			})
			.onConflictDoUpdate({
				target: [transitionRules.org_id, transitionRules.env],
				set: {
					carry_over_usages: carryOverUsages,
					updated_at: sql`ROUND(date_part('epoch', NOW()) * 1000)::BIGINT`,
				},
			})
			.returning();
		return row;
	}
}

import type { EntityBalance, Rollover } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export type ResetCusEntParam = {
	cus_ent_id: string;
	balance: number | null;
	additional_balance: number | null;
	adjustment: number;
	entities: Record<string, EntityBalance> | null;
	next_reset_at: number;
	rollover_insert: Pick<
		Rollover,
		"id" | "cus_ent_id" | "balance" | "usage" | "expires_at" | "entities"
	> | null;
};

export type AppliedCusEntReset = {
	balance: number;
	additional_balance: number;
	adjustment: number;
	entities: Record<string, EntityBalance> | null;
	next_reset_at: number;
	cache_version: number;
	rollover: Pick<
		Rollover,
		"id" | "cus_ent_id" | "balance" | "usage" | "expires_at" | "entities"
	> | null;
};

type ResetCusEntsResult = {
	applied: Record<string, AppliedCusEntReset>;
	skipped: string[];
};

/** Calls the `reset_customer_entitlements` PL/pgSQL function atomically. */
export const resetCusEnts = async ({
	ctx,
	resets,
}: {
	ctx: AutumnContext;
	resets: ResetCusEntParam[];
}): Promise<ResetCusEntsResult> => {
	const { db } = ctx;
	if (resets.length === 0) {
		return { applied: {}, skipped: [] };
	}

	const result = await db.execute(
		sql`SELECT * FROM reset_customer_entitlements(${JSON.stringify({
			resets,
		})}::jsonb)`,
	);

	const raw = result[0]?.reset_customer_entitlements as
		| ResetCusEntsResult
		| undefined;

	return {
		applied: raw?.applied ?? {},
		skipped: raw?.skipped ?? [],
	};
};

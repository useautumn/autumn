import { and, count, eq, inArray, notInArray, sql } from "drizzle-orm";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import type { TwdDb } from "../../../lib/getDb.ts";
import { ACCOUNTS_PER_KEY_CAP } from "../allocator/poolLimits.ts";

export type TwdTx = Parameters<Parameters<TwdDb["transaction"]>[0]>[0];

export const usableKey = and(
	eq(stripeKeys.usable, true),
	eq(stripeKeys.present, true),
);

/** Round-robin `need` over keys one at a time, capped by each key's clean count. */
const spreadAcrossKeys = ({
	available,
	need,
}: {
	available: Map<string, number>;
	need: number;
}): Map<string, number> => {
	const quota = new Map([...available.keys()].map((key) => [key, 0]));
	let remaining = need;
	while (remaining > 0) {
		let gave = false;
		for (const [key, cap] of available) {
			const taken = quota.get(key) ?? 0;
			if (remaining === 0 || taken >= cap) continue;
			quota.set(key, taken + 1);
			remaining--;
			gave = true;
		}
		if (!gave) break;
	}
	return quota;
};

/** Row-lock up to `need` clean accounts on usable keys, spread across keys, never past the per-key in_use cap. */
export const lockCleanAccounts = async ({
	tx,
	need,
}: {
	tx: TwdTx;
	need: number;
}): Promise<string[]> => {
	const perKey = await tx
		.select({
			platformAccountId: stripeAccounts.platformAccountId,
			clean: count(sql`case when ${stripeAccounts.state} = 'clean' then 1 end`),
			inUse: count(
				sql`case when ${stripeAccounts.state} = 'in_use' then 1 end`,
			),
		})
		.from(stripeAccounts)
		.innerJoin(
			stripeKeys,
			eq(stripeKeys.platformAccountId, stripeAccounts.platformAccountId),
		)
		.where(and(inArray(stripeAccounts.state, ["clean", "in_use"]), usableKey))
		.groupBy(stripeAccounts.platformAccountId);
	const available = new Map(
		perKey.map((row) => [
			row.platformAccountId,
			Math.max(0, Math.min(row.clean, ACCOUNTS_PER_KEY_CAP - row.inUse)),
		]),
	);

	const ids: string[] = [];
	// Second pass refills what concurrent claims skip-locked away from the first.
	for (let pass = 0; pass < 2 && ids.length < need; pass++) {
		const quota = spreadAcrossKeys({ available, need: need - ids.length });
		for (const [platformAccountId, want] of quota) {
			if (want === 0) continue;
			const rows = await tx
				.select({ id: stripeAccounts.id })
				.from(stripeAccounts)
				.where(
					and(
						eq(stripeAccounts.platformAccountId, platformAccountId),
						eq(stripeAccounts.state, "clean"),
						ids.length ? notInArray(stripeAccounts.id, ids) : undefined,
					),
				)
				.orderBy(stripeAccounts.stateChangedAt)
				.limit(want)
				.for("update", { skipLocked: true });
			ids.push(...rows.map((row) => row.id));
			available.set(
				platformAccountId,
				rows.length < want ? 0 : (available.get(platformAccountId) ?? 0) - want,
			);
		}
	}
	return ids;
};

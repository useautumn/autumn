import { count } from "drizzle-orm";
import type { AccountState } from "../../../db/schema/accounts.ts";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import type { TwdDb } from "../../../lib/getDb.ts";

export type AccountCounts = {
	clean: number;
	reserved: number;
	inUse: number;
	nuking: number;
	broken: number;
};

export const emptyAccountCounts = (): AccountCounts => ({
	clean: 0,
	reserved: 0,
	inUse: 0,
	nuking: 0,
	broken: 0,
});

const COUNT_FIELD: Record<AccountState, keyof AccountCounts> = {
	clean: "clean",
	reserved: "reserved",
	in_use: "inUse",
	nuking: "nuking",
	broken: "broken",
};

/** Ledger tally per platform account (key). */
export const countAccountsByKey = async ({
	db,
}: {
	db: TwdDb;
}): Promise<Map<string, AccountCounts>> => {
	const rows = await db
		.select({
			platformAccountId: stripeAccounts.platformAccountId,
			state: stripeAccounts.state,
			n: count(),
		})
		.from(stripeAccounts)
		.groupBy(stripeAccounts.platformAccountId, stripeAccounts.state);
	const byKey = new Map<string, AccountCounts>();
	for (const row of rows) {
		const counts = byKey.get(row.platformAccountId) ?? emptyAccountCounts();
		counts[COUNT_FIELD[row.state]] += row.n;
		byKey.set(row.platformAccountId, counts);
	}
	return byKey;
};

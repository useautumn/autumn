import { and, count, eq, inArray } from "drizzle-orm";
import type { AccountState } from "../../../db/schema/accounts.ts";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import type { TwdDb } from "../../../lib/getDb.ts";

export type AccountCounts = {
	clean: number;
	inUse: number;
	nuking: number;
	broken: number;
};

export const emptyAccountCounts = (): AccountCounts => ({
	clean: 0,
	inUse: 0,
	nuking: 0,
	broken: 0,
});

const COUNT_FIELD: Record<AccountState, keyof AccountCounts> = {
	clean: "clean",
	in_use: "inUse",
	nuking: "nuking",
	broken: "broken",
};

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

export const countHeldAccountsByRun = async ({
	db,
}: {
	db: TwdDb;
}): Promise<Map<string, number>> => {
	const rows = await db
		.select({ runId: stripeAccounts.runId, n: count() })
		.from(stripeAccounts)
		.where(eq(stripeAccounts.state, "in_use"))
		.groupBy(stripeAccounts.runId);
	return new Map(
		rows.flatMap((row) => (row.runId ? [[row.runId, row.n] as const] : [])),
	);
};

export const HELD_ACCOUNT_STATES = ["in_use"] as const;

export const countHeldAccountsOnKey = async ({
	db,
	platformAccountId,
}: {
	db: TwdDb;
	platformAccountId: string;
}): Promise<number> => {
	const [held] = await db
		.select({ n: count() })
		.from(stripeAccounts)
		.where(
			and(
				eq(stripeAccounts.platformAccountId, platformAccountId),
				inArray(stripeAccounts.state, [...HELD_ACCOUNT_STATES]),
			),
		);
	return held.n;
};

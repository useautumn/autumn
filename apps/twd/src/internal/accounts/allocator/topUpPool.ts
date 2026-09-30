import { and, count, eq, ne } from "drizzle-orm";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { topUpAccounts } from "../../keys/actions/topUpAccounts.ts";
import { usableKey } from "../repos/cleanAccountsRepo.ts";
import { ACCOUNTS_PER_KEY_CAP } from "./poolLimits.ts";

/** At most one top-up at a time, and none sooner than this after the last one started. */
const TOP_UP_COOLDOWN_MS = 60_000;

let lastStartedAt = 0;
let running: Promise<number> | undefined;

/** Grow keys under the cap to ACCOUNTS_PER_KEY_CAP non-broken accounts; resolves to accounts created. */
export const topUpPool = ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<number> | undefined => {
	if (running || Date.now() - lastStartedAt < TOP_UP_COOLDOWN_MS) return;
	lastStartedAt = Date.now();
	running = (async () => {
		const [[pool], [keys]] = await Promise.all([
			ctx.db
				.select({ n: count() })
				.from(stripeAccounts)
				.innerJoin(
					stripeKeys,
					eq(stripeKeys.platformAccountId, stripeAccounts.platformAccountId),
				)
				.where(and(ne(stripeAccounts.state, "broken"), usableKey)),
			ctx.db.select({ n: count() }).from(stripeKeys).where(usableKey),
		]);
		if (pool.n >= keys.n * ACCOUNTS_PER_KEY_CAP) return 0;
		const { created } = await topUpAccounts({
			ctx,
			targetPerKey: ACCOUNTS_PER_KEY_CAP,
		});
		return created;
	})().finally(() => {
		running = undefined;
	});
	return running;
};

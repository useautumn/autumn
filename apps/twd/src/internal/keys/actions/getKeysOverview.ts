import { asc } from "drizzle-orm";
import type { KeysOverview } from "../../../api/contract.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	countAccountsByKey,
	emptyAccountCounts,
} from "../../accounts/repos/accountCountsRepo.ts";
import { getKeyGate } from "../repos/keyGateRepo.ts";

export const getKeysOverview = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<KeysOverview> => {
	const [gate, keys, counts] = await Promise.all([
		getKeyGate({ db: ctx.db }),
		ctx.db.select().from(stripeKeys).orderBy(asc(stripeKeys.platformAccountId)),
		countAccountsByKey({ db: ctx.db }),
	]);
	return {
		gate,
		keys: keys.map((key) => ({
			platformAccountId: key.platformAccountId,
			keyHint: key.keyHint,
			displayName: key.displayName,
			usable: key.usable,
			unusableReason: key.unusableReason,
			webhookRegistered: key.connectWebhookId !== null,
			present: key.present,
			probedAt: key.probedAt?.toISOString() ?? null,
			accounts: counts.get(key.platformAccountId) ?? emptyAccountCounts(),
		})),
	};
};

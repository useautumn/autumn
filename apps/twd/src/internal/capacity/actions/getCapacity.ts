import { and, count, eq, inArray } from "drizzle-orm";
import type { Capacity } from "../../../api/contract.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import { runs, warmImages } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	countAccountsByKey,
	emptyAccountCounts,
} from "../../accounts/repos/accountCountsRepo.ts";
import { getKeyGate } from "../../keys/repos/keyGateRepo.ts";

/** Stripe budget: a usable key sustains ~4 concurrent workers before its rate limit bites. */
const FILES_PER_KEY = 4;
const LIVE_RUN_STATUSES = [
	"queued",
	"warming",
	"provisioning",
	"running",
	"tearing_down",
] as const;

export const getCapacity = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<Capacity> => {
	const [gate, keys, byKey, [liveRuns], [warmBuilds]] = await Promise.all([
		getKeyGate({ db: ctx.db }),
		ctx.db
			.select({ platformAccountId: stripeKeys.platformAccountId })
			.from(stripeKeys)
			.where(and(eq(stripeKeys.usable, true), eq(stripeKeys.present, true))),
		countAccountsByKey({ db: ctx.db }),
		ctx.db
			.select({ n: count() })
			.from(runs)
			.where(inArray(runs.status, [...LIVE_RUN_STATUSES])),
		ctx.db
			.select({ n: count() })
			.from(warmImages)
			.where(eq(warmImages.status, "building")),
	]);
	const accounts = emptyAccountCounts();
	for (const counts of byKey.values()) {
		for (const field of Object.keys(accounts) as (keyof typeof accounts)[]) {
			accounts[field] += counts[field];
		}
	}
	const cleanOnUsable = keys.reduce(
		(sum, key) => sum + (byKey.get(key.platformAccountId)?.clean ?? 0),
		0,
	);
	return {
		gate: gate.state,
		usableKeys: keys.length,
		accounts,
		liveRuns: liveRuns.n,
		maxFilesNow:
			gate.state === "draining"
				? 0
				: Math.min(cleanOnUsable, keys.length * FILES_PER_KEY),
		warmBuilds: warmBuilds.n,
	};
};

import { customerLsnRepo } from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import type {
	StalenessContext,
	StaleSubject,
} from "./types/stalenessContext.js";

const MAX_ROWS_PER_POLL = 1_000;

const toAppEnv = ({ env }: { env: string }): AppEnv | undefined =>
	Object.values(AppEnv).find((value) => value === env);

const pollUpdatedSubjects = async ({
	ctx,
	since,
	markStale,
}: {
	ctx: StalenessContext;
	since: Date;
	markStale: (subject: StaleSubject) => void;
}): Promise<Date> => {
	const rows = await customerLsnRepo.listUpdatedSince({
		db: ctx.postgres,
		since,
		limit: MAX_ROWS_PER_POLL,
	});

	for (const row of rows) {
		const env = toAppEnv({ env: row.env });
		if (!env) continue;
		markStale({ orgId: row.org_id, env, customerId: row.customer_id });
	}

	return rows.at(-1)?.updated_at ?? since;
};

// Until attach is a command, `customer_lsns` is the only signal that a subject
// changed underneath us. The DB clock is the cursor; this process never guesses.
export const runStalenessPoll = ({
	ctx,
	markStale,
}: {
	ctx: StalenessContext;
	markStale: (subject: StaleSubject) => void;
}): (() => void) => {
	let since = new Date();
	let polling = false;

	const ticker = setInterval(() => {
		if (polling) return;
		polling = true;

		void pollUpdatedSubjects({ ctx, since, markStale })
			.then((seen) => {
				since = seen;
			})
			.catch((error: unknown) => {
				ctx.logger.error("Ledger staleness poll failed", error, {
					event: "ledger.staleness_poll_failed",
				});
			})
			.finally(() => {
				polling = false;
			});
	}, ctx.intervalMs);
	ticker.unref();

	return () => clearInterval(ticker);
};

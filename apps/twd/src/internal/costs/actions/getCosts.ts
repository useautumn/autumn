import type { z } from "zod";
import type { Costs, CostsQuery } from "../../../api/contract.ts";
import { TwdError } from "../../../http/apiError.ts";
import { SYSTEM_ACTOR } from "../../../lib/createContext.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { toRunSummary } from "../../runs/repos/runsRepo.ts";
import { selectCostRows, selectTopCostRuns } from "../repos/costsRepo.ts";
import { getCostRates } from "./getCostRates.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_MS = 30 * DAY_MS;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const parseDate = ({ value, field }: { value: string; field: string }) => {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new TwdError({
			status: 400,
			code: "invalid_query",
			message: `\`${field}\` is not a date: "${value}".`,
			next: "Pass ISO dates, e.g. ?from=2026-09-01&to=2026-09-28, or omit both for the last 30 days.",
		});
	}
	return date;
};

/** UTC bucket start, matching Postgres date_trunc (weeks start Monday). */
const truncUtc = ({ ms, bucket }: { ms: number; bucket: "day" | "week" }) => {
	const day = Math.floor(ms / DAY_MS) * DAY_MS;
	return bucket === "day"
		? day
		: day - ((new Date(day).getUTCDay() + 6) % 7) * DAY_MS;
};

/** Modal spend (runs + warm builds) over a window, per bucket and per user; `to` date-only is inclusive. */
export const getCosts = async ({
	ctx,
	query,
}: {
	ctx: TwdContext;
	query: z.infer<typeof CostsQuery>;
}): Promise<Costs> => {
	const to = query.to
		? new Date(
				parseDate({ value: query.to, field: "to" }).getTime() +
					(DATE_ONLY.test(query.to) ? DAY_MS : 0),
			)
		: new Date();
	const from = query.from
		? parseDate({ value: query.from, field: "from" })
		: new Date(to.getTime() - DEFAULT_WINDOW_MS);
	if (from >= to) {
		throw new TwdError({
			status: 400,
			code: "invalid_query",
			message: `\`from\` (${from.toISOString()}) must be before \`to\` (${to.toISOString()}).`,
			next: "Swap the dates, or omit both for the last 30 days.",
		});
	}
	const { bucket } = query;
	const [rows, topRuns] = await Promise.all([
		selectCostRows({ ctx, from, to, bucket }),
		selectTopCostRuns({ ctx, from, to }),
	]);

	const buckets = new Map<number, Costs["buckets"][number]>();
	const step = bucket === "day" ? DAY_MS : 7 * DAY_MS;
	for (
		let ms = truncUtc({ ms: from.getTime(), bucket });
		ms < to.getTime();
		ms += step
	)
		buckets.set(ms, {
			start: new Date(ms).toISOString(),
			usd: 0,
			warmUsd: 0,
			runs: 0,
			byUser: {},
		});
	const users = new Map<string, Costs["users"][number]>();
	const totals: Costs["totals"] = {
		usd: 0,
		runs: 0,
		workerSeconds: 0,
		warmUsd: 0,
	};

	for (const row of rows) {
		const email =
			row.email ??
			(row.user_id === SYSTEM_ACTOR.userId ? SYSTEM_ACTOR.email : row.user_id);
		const slot = buckets.get(row.bucket_ms);
		if (slot) {
			slot.usd += row.usd;
			slot.warmUsd += row.warm_usd;
			slot.runs += row.runs;
			slot.byUser[email] = (slot.byUser[email] ?? 0) + row.usd;
		}
		const user = users.get(row.user_id) ?? {
			userId: row.user_id,
			email,
			usd: 0,
			runs: 0,
		};
		user.usd += row.usd;
		user.runs += row.runs;
		users.set(row.user_id, user);
		totals.usd += row.usd;
		totals.warmUsd += row.warm_usd;
		totals.runs += row.runs;
		totals.workerSeconds += row.worker_seconds;
	}

	return {
		rates: getCostRates(),
		totals,
		buckets: [...buckets.values()],
		users: [...users.values()].sort((a, b) => b.usd - a.usd),
		topRuns: topRuns.map(toRunSummary),
	};
};

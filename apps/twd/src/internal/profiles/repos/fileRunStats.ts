import type { FileStats } from "@tw/worker/runTestFileWithStats.ts";
import { and, asc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { RunResources as RunResourcesSchema } from "../../../api/contract.ts";
import { fileRunStats } from "../../../db/schema/profiles.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { splitRepetitionId } from "../../runs/repeat/repetitions.ts";

type RunResources = z.infer<typeof RunResourcesSchema>;

export const insertFileRunStats = async ({
	ctx,
	runId,
	file,
	attempt,
	worker,
	workerClass,
	stats,
}: {
	ctx: TwdContext;
	runId: string;
	/** Contract id; a repeat run's `<file>#<k>` is split into file and repetition. */
	file: string;
	attempt: number;
	worker: string | null;
	workerClass: string;
	stats: FileStats;
}) => {
	const { file: baseFile, repetition } = splitRepetitionId({ id: file });
	await ctx.db.insert(fileRunStats).values({
		id: `fs_${crypto.randomUUID().replaceAll("-", "")}`,
		runId,
		file: baseFile,
		repetition,
		attempt,
		worker,
		workerClass,
		stats,
	});
};

/** Oldest first, so a later row (a reschedule after worker death) wins when keyed. */
export const listFirstAttemptStats = ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}) =>
	ctx.db
		.select({
			file: fileRunStats.file,
			repetition: fileRunStats.repetition,
			stats: fileRunStats.stats,
		})
		.from(fileRunStats)
		.where(and(eq(fileRunStats.runId, runId), eq(fileRunStats.attempt, 1)))
		.orderBy(asc(fileRunStats.createdAt));

/** Run-wide totals and spreads over every attempt's stats line; null before the first one. */
export const summariseRunResources = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}): Promise<RunResources | null> => {
	const [row] = await ctx.db.execute<
		Record<keyof RunResources, number | null>
	>(sql`
		with s as (
			select stats from ${fileRunStats} where run_id = ${runId}
		)
		select
			count(*)::int as "attempts",
			coalesce(sum((stats->'stripe'->>'requests')::float8), 0) as "stripeRequests",
			coalesce(sum((stats->'stripe'->>'rateLimited')::float8), 0) as "rateLimited",
			percentile_cont(0.95) within group (order by (stats->'stripe'->>'permitWaitP95Ms')::float8) as "permitWaitP95Ms",
			max((stats->'stripe'->>'permitWaitMaxMs')::float8) as "permitWaitMaxMs",
			max((stats->'stripe'->>'machinePeakRps')::float8) as "workerPeakRps",
			max((stats->'stripe'->>'machinePeakInFlight')::float8) as "workerPeakInFlight",
			sum((stats->'cpu'->>'coreSeconds')::float8) as "cpuCoreSeconds",
			percentile_cont(0.95) within group (order by (stats->'cpu'->>'peakCores')::float8) as "cpuPeakCoresP95",
			percentile_cont(0.95) within group (order by (stats->'mem'->>'peakMib')::float8) as "memPeakMibP95",
			max((stats->'mem'->>'peakMib')::float8) as "memPeakMibMax"
		from s
	`);
	if (!row?.attempts) return null;
	const toNumber = (value: number | null) =>
		value === null ? null : Math.round(Number(value) * 100) / 100;
	return {
		attempts: Number(row.attempts),
		stripeRequests: toNumber(row.stripeRequests) ?? 0,
		rateLimited: toNumber(row.rateLimited) ?? 0,
		permitWaitP95Ms: toNumber(row.permitWaitP95Ms),
		permitWaitMaxMs: toNumber(row.permitWaitMaxMs),
		workerPeakRps: toNumber(row.workerPeakRps),
		workerPeakInFlight: toNumber(row.workerPeakInFlight),
		cpuCoreSeconds: toNumber(row.cpuCoreSeconds),
		cpuPeakCoresP95: toNumber(row.cpuPeakCoresP95),
		memPeakMibP95: toNumber(row.memPeakMibP95),
		memPeakMibMax: toNumber(row.memPeakMibMax),
	};
};

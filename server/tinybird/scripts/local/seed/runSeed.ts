import { sleep } from "../lib/sleep.js";
import { orgEnvWhere, sqlString } from "../lib/sqlString.js";
import { appendNdjson, ingestNdjson, querySql } from "../lib/tinybirdHttp.js";
import type { TinybirdTarget } from "../lib/tinybirdTarget.js";
import { generateEvent } from "./generateEvent.js";
import {
	type BatchRange,
	batchRanges,
	generationKey,
	type SeedOptions,
	totalEvents,
} from "./seedOptions.js";
import { createSeedTally, printSeedTally, tallyEvent } from "./seedTally.js";
import { verifyRollups } from "./verifyRollups.js";

type PendingBatch = { range: BatchRange; missing: "all" | Set<number> };

const ID_INDEX_SQL = "toUInt64(splitByChar('_', id)[3])";

const runIdsWhere = ({
	options,
	runKey,
}: {
	options: SeedOptions;
	runKey: string;
}) =>
	`${orgEnvWhere(options)} AND startsWith(id, ${sqlString(`seed_${runKey}_`)})`;

const findPendingBatches = async ({
	target,
	options,
	runKey,
	ranges,
}: {
	target: TinybirdTarget;
	options: SeedOptions;
	runKey: string;
	ranges: BatchRange[];
}): Promise<PendingBatch[]> => {
	const ends = `[${ranges.map((range) => range.end).join(",")}]`;
	const stored = await querySql<{ b: string; c: string }>({
		target,
		sql: `SELECT arrayFirstIndex(e -> ${ID_INDEX_SQL} < e, ${ends}) - 1 b, count() c FROM events WHERE ${runIdsWhere({ options, runKey })} GROUP BY b`,
	});
	const storedByBatch = new Map(
		stored.map((row) => [Number(row.b), Number(row.c)]),
	);

	const pending: PendingBatch[] = [];
	for (const range of ranges) {
		const size = range.end - range.start;
		const have = storedByBatch.get(range.batch) ?? 0;
		if (have > size)
			throw new Error(
				`Batch ${range.batch} has ${have} rows for ${size} ids: events were double-inserted; run reset.`,
			);
		if (have === size) continue;
		if (have === 0) {
			pending.push({ range, missing: "all" });
			continue;
		}
		const rows = await querySql<{ i: string }>({
			target,
			sql: `SELECT ${ID_INDEX_SQL} i FROM events WHERE ${runIdsWhere({ options, runKey })} AND ${ID_INDEX_SQL} >= ${range.start} AND ${ID_INDEX_SQL} < ${range.end}`,
		});
		const storedIndexes = new Set(rows.map((row) => Number(row.i)));
		const missing = new Set<number>();
		for (let i = range.start; i < range.end; i++)
			if (!storedIndexes.has(i)) missing.add(i);
		pending.push({ range, missing });
	}
	return pending;
};

const otherRunsBlockInsert = async ({
	target,
	options,
	runKey,
}: {
	target: TinybirdTarget;
	options: SeedOptions;
	runKey: string;
}) => {
	const runs = await querySql<{ run: string; c: string }>({
		target,
		sql: `SELECT splitByChar('_', id)[2] run, count() c FROM events WHERE ${orgEnvWhere(options)} AND startsWith(id, 'seed_') GROUP BY run`,
	});
	const others = runs.filter((row) => row.run !== runKey);
	if (others.length === 0 || options.allowOtherRuns) return false;
	console.error(
		`${options.orgId}/${options.env} already holds other seed runs (${others.map((r) => `${r.run}: ${r.c} rows`).join(", ")}).\n` +
			"Run `reset` first, reuse the same args (including --end) to resume that run, or pass --allow-other-runs to add on top.",
	);
	return true;
};

const waitForLiveMinute = async ({ options }: { options: SeedOptions }) => {
	if (options.liveHourEvents === 0) return;
	const waitMs = options.end.getTime() + 61_000 - Date.now();
	if (waitMs > 0 && waitMs < 3_600_000) {
		console.error(
			`  waiting ${Math.ceil(waitMs / 1000)}s so live-hour events aren't in the future`,
		);
		await sleep(waitMs);
	}
};

const runPool = async ({
	concurrency,
	jobs,
}: {
	concurrency: number;
	jobs: (() => Promise<void>)[];
}) => {
	let next = 0;
	const worker = async () => {
		while (next < jobs.length) await jobs[next++]();
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, jobs.length) }, worker),
	);
};

export const runSeed = async ({
	target,
	options,
}: {
	target: TinybirdTarget | null;
	options: SeedOptions;
}) => {
	const runKey = generationKey({ options });
	const total = totalEvents({ options });
	const ranges = batchRanges({ options });
	console.error(
		`seed run ${runKey}: ${total.toLocaleString()} events for ${options.orgId}/${options.env}, presets ${options.presets.join("+")}, window ${options.days}d ending ${options.end.toISOString()}`,
	);

	const tally = createSeedTally();
	const generateRange = ({
		range,
		keep,
	}: {
		range: BatchRange;
		keep: (index: number) => boolean;
	}) => {
		const lines: string[] = [];
		for (let index = range.start; index < range.end; index++) {
			const event = generateEvent({ options, runKey, index });
			tallyEvent({ tally, event });
			if (keep(index)) lines.push(JSON.stringify(event));
		}
		return lines;
	};

	if (options.dryRun) {
		for (const range of ranges) generateRange({ range, keep: () => false });
		printSeedTally({ tally, options, runKey, batches: ranges.length });
		return true;
	}

	if (!target)
		throw new Error("A Tinybird target is required unless --dry-run is set");
	if (await otherRunsBlockInsert({ target, options, runKey })) return false;
	const pending = new Map(
		(await findPendingBatches({ target, options, runKey, ranges })).map(
			(batch) => [batch.range.batch, batch],
		),
	);
	await waitForLiveMinute({ options });

	const started = Date.now();
	let sent = 0;
	const jobs: (() => Promise<void>)[] = [];
	for (const range of ranges) {
		const batch = pending.get(range.batch);
		if (!batch) {
			generateRange({ range, keep: () => false });
			continue;
		}
		jobs.push(async () => {
			const lines = generateRange({
				range,
				keep: (i) => batch.missing === "all" || batch.missing.has(i),
			});
			const send = range.small ? appendNdjson : ingestNdjson;
			await send({ target, datasource: "events", ndjson: lines.join("\n") });
			sent += lines.length;
			process.stderr.write(
				`\r  inserted ${sent.toLocaleString()} / ${total.toLocaleString()}`,
			);
		});
	}
	await runPool({ concurrency: options.concurrency, jobs });
	const seconds = (Date.now() - started) / 1000;
	if (jobs.length > 0) process.stderr.write("\n");

	printSeedTally({ tally, options, runKey, batches: ranges.length });
	console.log(
		jobs.length === 0
			? "insert: nothing to do, this run is already fully seeded"
			: `insert: ${sent.toLocaleString()} events in ${jobs.length} inserts, ${seconds.toFixed(1)}s (${Math.round(sent / seconds).toLocaleString()} rows/s)`,
	);

	const [stored] = await querySql<{ c: string }>({
		target,
		sql: `SELECT count() c FROM events WHERE ${runIdsWhere({ options, runKey })}`,
	});
	const storedOk = Number(stored.c) === total;
	console.log(
		`stored: ${Number(stored.c).toLocaleString()} rows for run ${runKey} ${storedOk ? "== generated" : `!= generated ${total}`}`,
	);
	if (!options.verify) return storedOk;
	return (
		(await verifyRollups({ target, orgId: options.orgId, env: options.env })) &&
		storedOk
	);
};

import type { AutumnLogger } from "@autumn/logging";
import type { SubjectLoadGate } from "../external/postgres/createSubjectLoadGate.js";
import { percentileOf, sampleInto } from "./sampleWindow.js";

export type DatabaseQueryKind =
	| "subject_rows"
	| "entity_rows"
	| "catalog_rows"
	| "billing_anchors"
	| "claim_customer"
	| "pooled_balances"
	| "partition_progress"
	| "flush";

type Distribution = { count: number; p50: number; p99: number; max: number };

export type DatabaseTimingsSummary = {
	inFlightMax: number;
	queries: Partial<
		Record<DatabaseQueryKind, Distribution & { errors: number }>
	>;
	subjectLoadWait: Distribution;
	errorCodes: Record<string, number>;
};

type SampledWindow = { count: number; max: number; samples: number[] };

const MAX_SAMPLES = 2_000;

function emptySampled(): SampledWindow {
	return { count: 0, max: 0, samples: [] };
}

function addSample({
	window,
	value,
}: {
	window: SampledWindow;
	value: number;
}): void {
	window.count += 1;
	window.max = Math.max(window.max, value);
	sampleInto({
		samples: window.samples,
		value,
		seen: window.count,
		limit: MAX_SAMPLES,
	});
}

function distributionOf({ window }: { window: SampledWindow }): Distribution {
	const sorted = [...window.samples].sort((a, b) => a - b);
	return {
		count: window.count,
		p50: round(percentileOf({ sorted, fraction: 0.5 })),
		p99: round(percentileOf({ sorted, fraction: 0.99 })),
		max: round(window.max),
	};
}

/** A SQLSTATE or socket code; pg names its own failures (a read timeout, a dropped connection) only in the message. */
function errorCodeOf({ cause }: { cause: unknown }): string {
	if (!(cause instanceof Error)) return "unknown";
	const code = (cause as { code?: unknown }).code;
	if (typeof code === "string") return code;
	return cause.name === "Error" ? cause.message : cause.name;
}

export function createDatabaseTimings() {
	let inFlight = 0;
	let inFlightMax = 0;
	let queries = new Map<
		DatabaseQueryKind,
		{ durations: SampledWindow; errors: number }
	>();
	let subjectLoadWait = emptySampled();
	let errorCodes: Record<string, number> = {};

	function queryStarted(): void {
		inFlight += 1;
		inFlightMax = Math.max(inFlightMax, inFlight);
	}

	function queryFinished({
		kind,
		durationMs,
		cause,
	}: {
		kind: DatabaseQueryKind;
		durationMs: number;
		cause?: unknown;
	}): void {
		inFlight -= 1;
		const window = queries.get(kind) ?? {
			durations: emptySampled(),
			errors: 0,
		};
		queries.set(kind, window);
		addSample({ window: window.durations, value: durationMs });
		if (cause === undefined) return;
		window.errors += 1;
		const code = errorCodeOf({ cause });
		errorCodes[code] = (errorCodes[code] ?? 0) + 1;
	}

	function recordSubjectLoadWait({ waitMs }: { waitMs: number }): void {
		addSample({ window: subjectLoadWait, value: waitMs });
	}

	function drain(): DatabaseTimingsSummary {
		const summary: DatabaseTimingsSummary = {
			inFlightMax,
			queries: Object.fromEntries(
				[...queries].map(([kind, window]) => [
					kind,
					{
						...distributionOf({ window: window.durations }),
						errors: window.errors,
					},
				]),
			),
			subjectLoadWait: distributionOf({ window: subjectLoadWait }),
			errorCodes,
		};
		inFlightMax = inFlight;
		queries = new Map();
		subjectLoadWait = emptySampled();
		errorCodes = {};
		return summary;
	}

	return { queryStarted, queryFinished, recordSubjectLoadWait, drain };
}

export type DatabaseTimings = ReturnType<typeof createDatabaseTimings>;

export const databaseTimings = createDatabaseTimings();

export async function timeQuery<Value>({
	ctx,
	kind,
	run,
}: {
	ctx: { timings: Pick<DatabaseTimings, "queryStarted" | "queryFinished"> };
	kind: DatabaseQueryKind;
	run: () => Promise<Value>;
}): Promise<Value> {
	const startedAt = performance.now();
	ctx.timings.queryStarted();
	try {
		const value = await run();
		ctx.timings.queryFinished({
			kind,
			durationMs: performance.now() - startedAt,
		});
		return value;
	} catch (cause) {
		ctx.timings.queryFinished({
			kind,
			durationMs: performance.now() - startedAt,
			cause,
		});
		throw cause;
	}
}

const DATABASE_REPORT_INTERVAL_MS = 10_000;

export function createDatabaseReporter({
	ctx,
	config,
}: {
	ctx: {
		logger: Pick<AutumnLogger, "info">;
		timings: Pick<DatabaseTimings, "drain">;
		gate: Pick<SubjectLoadGate, "snapshot">;
		schedule?: (params: { intervalMs: number; run(): void }) => () => void;
	};
	config: {
		deployment: string;
		endpoint: string;
		poolSize: number;
		subjectLoadConcurrency: number;
	};
}): { start(): void; stop(): void } {
	let cancel: (() => void) | undefined;

	function report(): void {
		try {
			const { subjectLoadWait, ...summary } = ctx.timings.drain();
			ctx.logger.info(
				{
					event: "balance_worker.database",
					workerDeployment: config.deployment,
					data: {
						workerEndpoint: config.endpoint,
						poolSize: config.poolSize,
						...summary,
						subjectLoads: {
							concurrency: config.subjectLoadConcurrency,
							...ctx.gate.snapshot(),
							wait: subjectLoadWait,
						},
					},
				},
				"Balance worker database",
			);
		} catch {}
	}

	function start(): void {
		if (cancel) return;
		ctx.timings.drain();
		cancel = (ctx.schedule ?? scheduleReport)({
			intervalMs: DATABASE_REPORT_INTERVAL_MS,
			run: report,
		});
	}

	function stop(): void {
		cancel?.();
		cancel = undefined;
	}

	return { start, stop };
}

function scheduleReport({
	intervalMs,
	run,
}: {
	intervalMs: number;
	run(): void;
}): () => void {
	const timer = setInterval(run, intervalMs);
	timer.unref();
	return () => clearInterval(timer);
}

function round(ms: number): number {
	return Math.round(ms * 100) / 100;
}

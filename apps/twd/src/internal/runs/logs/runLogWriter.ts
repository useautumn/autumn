import { runLogs } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { createLogBudget } from "./logBudget.ts";

const FLUSH_MS = 1_000;
const MAX_BUFFERED = 2_000;
const CHARS_PER_WORKER = 256_000;
const CHARS_PER_FILE = 2_000_000;
const CHARS_RUN_LEVEL = 5_000_000;

type Pending = { file: string | null; worker: string | null; chunk: string };

/** Buffers a run's log chunks and bulk-inserts them every second. */
export const createRunLogWriter = ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}) => {
	let pending: Pending[] = [];
	const budget = createLogBudget({
		perWorker: CHARS_PER_WORKER,
		perFile: CHARS_PER_FILE,
		run: CHARS_RUN_LEVEL,
	});
	let chain: Promise<void> = Promise.resolve();

	const flush = () => {
		if (pending.length === 0) return chain;
		const rows = pending;
		pending = [];
		chain = chain
			.then(async () => {
				await ctx.db
					.insert(runLogs)
					.values(rows.map((row) => ({ runId, ...row })));
			})
			.catch((error: unknown) =>
				ctx.logger.warn("run log write failed", {
					runId,
					error: String(error),
				}),
			);
		return chain;
	};
	const timer = setInterval(() => void flush(), FLUSH_MS);

	const append = (row: Pending) => {
		if (!budget.take({ ...row, chars: row.chunk.length })) return;
		pending.push(row);
		if (pending.length >= MAX_BUFFERED) void flush();
	};

	const close = async () => {
		clearInterval(timer);
		await flush();
	};

	return { append, close };
};

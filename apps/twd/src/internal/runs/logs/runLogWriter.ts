import { runLogs } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

const FLUSH_MS = 1_000;
const MAX_BUFFERED = 2_000;
/** One chatty worker shouldn't grow the table without bound. */
const MAX_CHARS_PER_RUN = 50_000_000;

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
	let written = 0;
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
		if (written >= MAX_CHARS_PER_RUN) return;
		written += row.chunk.length;
		pending.push(row);
		if (pending.length >= MAX_BUFFERED) void flush();
	};

	const close = async () => {
		clearInterval(timer);
		await flush();
	};

	return { append, close };
};

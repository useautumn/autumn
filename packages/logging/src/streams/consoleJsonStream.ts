import pino from "pino";

const DEFAULT_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const DEFAULT_MIN_WRITE_BYTES = 4096;
const DEFAULT_DROP_REPORT_INTERVAL_MS = 5_000;
const DEFAULT_FLUSH_INTERVAL_MS = 1_000;
const STDOUT_FD = 1;

export type ConsoleJsonStream = pino.DestinationStream & {
	/** Resolves once everything buffered so far has been handed to the fd. */
	flush(): Promise<void>;
	/** Writes what is buffered before the process ends; the one blocking write allowed. */
	flushSync(): void;
	/** Lines dropped so far because the buffer was full. */
	dropped(): number;
};

/**
 * JSON lines to stdout without ever blocking the caller. A `console.log` is a
 * synchronous write, and stdout is a pipe to the log shipper: when the shipper
 * falls behind, the pipe fills and every log call stalls the event loop for as
 * long as it takes to drain. This stream buffers in memory and writes from the
 * thread pool instead. The buffer is bounded; past it, lines are dropped and
 * counted, and the count is reported once the shipper keeps up again. Losing
 * log lines under pressure is the trade: the request path never waits on I/O.
 */
export const createConsoleJsonStream = ({
	fd = STDOUT_FD,
	maxBufferBytes = DEFAULT_MAX_BUFFER_BYTES,
	minWriteBytes = DEFAULT_MIN_WRITE_BYTES,
	dropReportIntervalMs = DEFAULT_DROP_REPORT_INTERVAL_MS,
	flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
}: {
	fd?: number;
	maxBufferBytes?: number;
	minWriteBytes?: number;
	dropReportIntervalMs?: number;
	/** How long a line may wait below `minWriteBytes` before it is written anyway. */
	flushIntervalMs?: number;
} = {}): ConsoleJsonStream => {
	const destination = pino.destination({
		dest: fd,
		sync: false,
		minLength: minWriteBytes,
		maxLength: maxBufferBytes,
	});
	let dropped = 0;
	let reported = 0;
	let reportTimer: ReturnType<typeof setTimeout> | null = null;

	function reportDrops(): void {
		reportTimer = null;
		const count = dropped - reported;
		if (count === 0) return;
		reported = dropped;
		destination.write(
			`${JSON.stringify({
				level: "WARN",
				time: Date.now(),
				msg: "Log lines dropped: stdout could not keep up",
				dropped: count,
			})}\n`,
		);
	}
	function scheduleDropReport(): void {
		if (reportTimer) return;
		reportTimer = setTimeout(reportDrops, dropReportIntervalMs);
		reportTimer.unref?.();
	}
	destination.on("drop", () => {
		dropped += 1;
		scheduleDropReport();
	});
	// A closed stdout must not take the process with it; there is nowhere left to report to.
	destination.on("error", () => undefined);
	// A quiet service never fills the buffer; without this its few lines would wait until it exits.
	const flushTimer = setInterval(() => destination.flush(), flushIntervalMs);
	flushTimer.unref?.();
	function flushSync(): void {
		try {
			destination.flushSync();
		} catch {
			// Nothing to do: the fd is gone or already flushed.
		}
	}
	process.once("exit", flushSync);

	function write(data: string): boolean {
		return destination.write(data);
	}
	function flush(): Promise<void> {
		return new Promise((resolve) => {
			destination.flush(() => resolve());
		});
	}
	return { write, flush, flushSync, dropped: () => dropped };
};

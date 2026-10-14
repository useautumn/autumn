import pino from "pino";

const DEFAULT_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const DEFAULT_MIN_WRITE_BYTES = 4096;
const DEFAULT_DROP_REPORT_INTERVAL_MS = 5_000;
const DEFAULT_FLUSH_INTERVAL_MS = 1_000;
const STDOUT_FD = 1;

export type ConsoleJsonStream = pino.DestinationStream & {
	flush(): Promise<void>;
	flushSync(): void;
	dropped(): number;
};

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
	destination.on("error", () => undefined);
	const flushTimer = setInterval(() => destination.flush(), flushIntervalMs);
	flushTimer.unref?.();
	function flushSync(): void {
		try {
			destination.flushSync();
		} catch {}
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

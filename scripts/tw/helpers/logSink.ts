/**
 * Log sink — the SINGLE owner of "where does orchestrator output go" for `bun tw`.
 *
 * Why this exists: `bun tw` runs the Ink TUI runner IN-PROCESS (via
 * `runWithExecutor`), so the TUI and a firehose of raw stdout writes (the
 * orchestrator's own `[tw] …` logs, the forwarded `[ingress] …` lines, the
 * per-worker boot/server logs) all share the SAME stdout. Ink can only render
 * correctly when it OWNS stdout, so during the RUN phase those concurrent writes
 * cause layout shift + lag (50 workers × server logs is a huge volume).
 *
 * The sink solves this with a quiet-mode switch:
 *   - BEFORE the run (resolve, warm-up, fan-out) and AFTER (teardown): there is no
 *     TUI, so the sink writes straight to `process.stdout` exactly as before.
 *   - DURING the run (while the Ink app is mounted): the sink writes to a per-run
 *     LOG FILE instead, so NOTHING but Ink touches the terminal. The file
 *     (`~/.autumn-tw/runs/<runId>.log`) keeps the full noise for inspection.
 *
 * This is SWARM-ONLY: `bun t` spawns the runner as a subprocess (it owns stdout)
 * and never imports/uses this module, so its output is unchanged.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

let quietMode = false;
let logFilePath: string | undefined;
let warnedFileFailure = false;

/**
 * Optional live subscriber (the opentui TUI's raw-logs pane). When set, every
 * complete line is delivered to it AND the terminal is left untouched (the TUI
 * owns stdout), while the run log file still captures the full firehose.
 */
let logSubscriber: ((line: string) => void) | undefined;
let lineBuffer = "";

// SGR / control escape sequences (chalk colors etc). opentui draws its own colors,
// so raw ANSI in `<text>` content is rendered as literal bytes and corrupts the
// layout — strip it before handing lines to the TUI subscriber.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escapes is the point
const ANSI_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/g;
const stripAnsi = (text: string): string => text.replace(ANSI_PATTERN, "");

const feedSubscriber = (text: string): void => {
	if (!logSubscriber) {
		return;
	}
	lineBuffer += text;
	let newlineIndex = lineBuffer.indexOf("\n");
	while (newlineIndex >= 0) {
		logSubscriber(stripAnsi(lineBuffer.slice(0, newlineIndex)));
		lineBuffer = lineBuffer.slice(newlineIndex + 1);
		newlineIndex = lineBuffer.indexOf("\n");
	}
};

/**
 * Register (or clear with `undefined`) the live logs subscriber. Setting one puts
 * the sink in "TUI owns the terminal" mode: lines flow to the subscriber + log
 * file, never to stdout.
 */
export const setLogSubscriber = (
	subscriber: ((line: string) => void) | undefined,
): void => {
	logSubscriber = subscriber;
	if (!subscriber) {
		lineBuffer = "";
	}
};

/**
 * Point the sink at a run log file. Creates the parent directory. Called by the
 * orchestrator right before it mounts the Ink runner, so quiet-mode writes have
 * somewhere to land.
 */
export const setLogFile = (path: string): void => {
	logFilePath = path;
	try {
		mkdirSync(dirname(path), { recursive: true });
	} catch {
		// best-effort; the append below will surface a real failure once.
	}
};

/** Enter quiet mode: subsequent `sink(...)` writes go to the log file, not stdout. */
export const enableQuietMode = (): void => {
	quietMode = true;
};

/** Leave quiet mode: subsequent `sink(...)` writes go back to stdout. */
export const disableQuietMode = (): void => {
	quietMode = false;
};

/** The active log file path (so the orchestrator can print it in the final summary). */
export const getLogFile = (): string | undefined => logFilePath;

/**
 * Route raw text to the sink. In quiet mode it is appended to the run log file
 * (Ink owns the terminal); otherwise it is written to stdout. The text is written
 * VERBATIM (no implicit newline), so streamed sandbox chunks aren't fragmented;
 * line-oriented callers (`sinkLine`) add their own newline. Never throws — a
 * logging failure must not break the run.
 */
export const sink = (text: string): void => {
	// Live TUI logs pane (line-buffered). Independent of file/stdout routing.
	feedSubscriber(text);

	// The run log file keeps the full firehose whenever quiet mode is on.
	if (quietMode && logFilePath) {
		try {
			appendFileSync(logFilePath, text);
		} catch (error) {
			if (!warnedFileFailure) {
				warnedFileFailure = true;
				process.stdout.write(
					`[tw] log sink: failed to write run log file (${(error as Error).message})\n`,
				);
			}
		}
		return;
	}

	// Only touch the terminal when nothing else owns it (no TUI subscriber).
	if (logSubscriber) {
		return;
	}
	process.stdout.write(text);
};

/** Route one complete log line (newline appended) through {@link sink}. */
export const sinkLine = (line: string): void => {
	sink(`${line}\n`);
};

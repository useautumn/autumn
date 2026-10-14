import { appendFileSync } from "node:fs";
import { threadId } from "node:worker_threads";

// BENCH-ONLY (bench/atom-rig-trace): per-request timestamps for rig requests carrying x-rig-id, one file per thread.
export const RIG_ID_HEADER = "x-rig-id";
const dir = process.env.RIG_TRACE_DIR;
let lines: string[] = [];

export function rigTrace(line: Record<string, unknown>): void {
	if (!dir) return;
	lines.push(JSON.stringify({ ...line, thread: threadId }));
}

if (dir)
	setInterval(() => {
		if (lines.length === 0) return;
		const out = `${lines.join("\n")}\n`;
		lines = [];
		appendFileSync(`${dir}/replica-trace-${process.pid}-${threadId}.log`, out);
	}, 1_000).unref();

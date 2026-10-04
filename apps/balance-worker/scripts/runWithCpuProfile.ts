// Starts the balance worker, under Bun's CPU profiler when
// BALANCE_WORKER_CPU_PROFILE=1. The profile is only written when the process
// exits, and a container's disk goes with it, so on exit the launcher uploads
// whatever the profiler wrote to the checkpoint bucket before returning.
import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { initInfisical } from "@autumn/shared/utils/infisical";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
	createGcLogTotals,
	isGcLogLine,
} from "../src/logging/processStats/gcLogTotals.js";

const PROFILE_DIR = "/tmp/balance-worker-cpu-profile";
const GC_TOTALS_PATH = "/tmp/balance-worker-gc.json";
const GC_TOTALS_WRITE_MS = 1_000;

await initInfisical();
// Diagnostic branch: profile unless explicitly turned off.
const profiling = process.env.BALANCE_WORKER_CPU_PROFILE !== "0";

// Diagnostic branch: JSC logs each collection to stderr; the launcher folds it into totals the worker reports.
const logsGc = process.env.BALANCE_WORKER_GC_LOG !== "0";

const child = Bun.spawn(
	[
		process.execPath,
		"--config=./bunfig.toml",
		...(profiling
			? ["--cpu-prof", "--cpu-prof-md", `--cpu-prof-dir=${PROFILE_DIR}`]
			: []),
		"src/main.ts",
	],
	{
		stdio: ["inherit", "inherit", logsGc ? "pipe" : "inherit"],
		env: logsGc
			? {
					...process.env,
					BUN_JSC_logGC: "1",
					BALANCE_WORKER_GC_TOTALS_PATH: GC_TOTALS_PATH,
				}
			: process.env,
	},
);
const forwardingStderr = logsGc ? forwardStderr(child.stderr) : undefined;

for (const signal of ["SIGTERM", "SIGINT"] as const) {
	process.on(signal, () => child.kill(signal));
}

const exitCode = await child.exited;
await forwardingStderr;
if (profiling) await uploadProfiles();
process.exit(exitCode);

async function uploadProfiles(): Promise<void> {
	try {
		const bucket =
			process.env.BALANCE_WORKER_CHECKPOINT_BUCKET ??
			"tf-balance-worker-staging-snapshots-001092881874-us-east-1";
		const deployment = process.env.BALANCE_WORKER_DEPLOYMENT ?? "unknown";
		const prefix = `balance-checkpoints/${deployment}/cpu-profiles/${new Date().toISOString()}-${hostname()}`;
		const client = new S3Client({
			region: process.env.BALANCE_WORKER_CHECKPOINT_REGION ?? "us-east-1",
		});
		for (const file of readdirSync(PROFILE_DIR)) {
			await client.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: `${prefix}/${file}`,
					Body: readFileSync(join(PROFILE_DIR, file)),
				}),
			);
			console.log(`cpu profile uploaded: s3://${bucket}/${prefix}/${file}`);
		}
	} catch (cause) {
		// A failed upload must not change how the worker exited.
		console.error("cpu profile upload failed", cause);
	}
}

/** Every stderr line but JSC's GC log reaches our stderr unchanged; the GC log becomes totals on disk. */
async function forwardStderr(
	stderr: ReadableStream<Uint8Array> | number | undefined,
): Promise<void> {
	if (!(stderr instanceof ReadableStream)) return;
	const totals = createGcLogTotals();
	function writeTotals(): void {
		try {
			writeFileSync(`${GC_TOTALS_PATH}.tmp`, JSON.stringify(totals.read()));
			renameSync(`${GC_TOTALS_PATH}.tmp`, GC_TOTALS_PATH);
		} catch {
			// The worker reports no GC rather than the launcher failing.
		}
	}
	const timer = setInterval(writeTotals, GC_TOTALS_WRITE_MS);
	const decoder = new TextDecoder();
	let pending = "";
	for await (const chunk of stderr) {
		pending += decoder.decode(chunk, { stream: true });
		let newline = pending.indexOf("\n");
		while (newline !== -1) {
			const line = pending.slice(0, newline);
			pending = pending.slice(newline + 1);
			if (isGcLogLine(line)) totals.consume(line);
			else process.stderr.write(`${line}\n`);
			newline = pending.indexOf("\n");
		}
	}
	if (pending) process.stderr.write(pending);
	clearInterval(timer);
	writeTotals();
}

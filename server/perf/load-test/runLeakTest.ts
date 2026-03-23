/**
 * Memory leak test orchestrator.
 *
 * Runs Artillery load, takes a snapshot before and after a GC cooldown period,
 * then prints paths for Chrome DevTools analysis.
 *
 * Usage: cd server && bun loadtest:leak
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const SNAPSHOTS_DIR = join(import.meta.dir, "../snapshots");
const ARTILLERY_CONFIG = join(import.meta.dir, "memoryLeak.yml");
const SUMMARY_SCRIPT = join(import.meta.dir, "summarizeLeakSnapshots.ts");
const SERVER_URL = "http://localhost:8080";
const SNAPSHOT_ENDPOINT = `${SERVER_URL}/debug/heap-snapshot`;
const COOLDOWN_SECONDS = 60;

const secretKey = process.env.UNIT_TEST_AUTUMN_SECRET_KEY;
if (!secretKey) {
	console.error("UNIT_TEST_AUTUMN_SECRET_KEY is required");
	process.exit(1);
}

const authHeader = `Bearer ${secretKey}`;

/** Take a heap snapshot and return the file path. */
async function takeSnapshot({ label }: { label: string }): Promise<string> {
	console.log(`\n[snapshot] Taking ${label} snapshot...`);
	const res = await fetch(SNAPSHOT_ENDPOINT, {
		headers: { Authorization: authHeader },
	});

	if (!res.ok) {
		throw new Error(
			`Failed to take ${label} snapshot: ${res.status} ${res.statusText}`,
		);
	}

	const data = (await res.json()) as { ok: boolean; file: string; path: string };
	console.log(`[snapshot] ${label}: ${data.file}`);
	return data.path;
}

/** Wait for n seconds with a countdown. */
async function wait({ seconds, label }: { seconds: number; label: string }) {
	for (let i = seconds; i > 0; i--) {
		process.stdout.write(`\r[${label}] ${i}s remaining...`);
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	process.stdout.write(`\r[${label}] done.                    \n`);
}

/** Clean old snapshots. */
function cleanSnapshots() {
	if (!existsSync(SNAPSHOTS_DIR)) {
		mkdirSync(SNAPSHOTS_DIR, { recursive: true });
		return;
	}

	const files = readdirSync(SNAPSHOTS_DIR).filter((f) =>
		f.endsWith(".heapsnapshot"),
	);
	for (const file of files) {
		unlinkSync(join(SNAPSHOTS_DIR, file));
	}
	if (files.length > 0) {
		console.log(`[cleanup] Removed ${files.length} old snapshot(s)`);
	}
}

function runSnapshotSummary({
	beforePath,
	afterPath,
}: {
	beforePath: string;
	afterPath: string;
}) {
	console.log("\n[summary] Generating heap diff report...\n");

	try {
		execSync(
			`bun "${SUMMARY_SCRIPT}" --before "${beforePath}" --after "${afterPath}"`,
			{
				stdio: "inherit",
				env: { ...process.env },
			},
		);
	} catch {
		console.error("\n[summary] Failed to generate heap diff report");
	}
}

async function main() {
	console.log("=== Memory Leak Test ===\n");

	// 0. Verify server is running
	try {
		await fetch(SERVER_URL);
	} catch {
		console.error("Server is not running on localhost:8080. Start it with: bun d");
		process.exit(1);
	}

	// 1. Clean old snapshots
	cleanSnapshots();

	// 2. Take baseline snapshot (before any load)
	const beforePath = await takeSnapshot({ label: "before-load" });

	// 3. Run Artillery load test
	console.log("\n[artillery] Starting load test...\n");
	try {
		execSync(`npx artillery run ${ARTILLERY_CONFIG}`, {
			stdio: "inherit",
			env: { ...process.env },
		});
	} catch {
		console.error("\n[artillery] Load test failed, continuing with snapshots...");
	}

	// 4. Cooldown — let GC clean up
	await wait({ seconds: COOLDOWN_SECONDS, label: "cooldown" });

	// 5. Take snapshot after load + GC cooldown
	const afterPath = await takeSnapshot({ label: "after-cooldown" });

	// 6. Generate terminal-friendly summary for agent/debugging workflows
	runSnapshotSummary({ beforePath, afterPath });

	console.log("\n=== Done ===");
	console.log(`Snapshots saved in: ${SNAPSHOTS_DIR}`);
	console.log("  before-load:    ", beforePath);
	console.log("  after-cooldown: ", afterPath);
	console.log(
		"\nGenerate a paste-friendly diff: bun perf/load-test/summarizeLeakSnapshots.ts --before \"" +
			beforePath +
			"\" --after \"" +
			afterPath +
			"\"",
	);
	console.log("\nOpen in Chrome DevTools: chrome://inspect → Open dedicated DevTools for Node → Memory → Load");
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});

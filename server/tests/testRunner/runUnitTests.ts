/**
 * Sharded unit-test runner — splits tests/unit across a few `bun test`
 * processes so the suite finishes in seconds on CI hardware.
 *
 * Why not `bun test --isolate`: a process per file re-pays the server import
 * graph ~365 times (minutes of wall clock). Why not one plain `bun test`:
 * a single process is CPU-bound on one core; a handful of shards cuts wall
 * time roughly by the shard count while keeping per-process import cost low.
 *
 * Shards are whole top-level directories under tests/unit (files directly at
 * the root form one extra group), greedily bin-packed by test-file count.
 * Keeping a directory's files in one process preserves their relative
 * execution order, which matters for mock.module hygiene.
 *
 * More shards than cores is deliberate: several suites hold real timers
 * (TTL expiries, lane-isolation holds), so extra shards overlap that sleep
 * time instead of serializing it. Override with UNIT_SHARDS.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const SERVER_ROOT = path.resolve(import.meta.dir, "../..");
const UNIT_ROOT = path.join(SERVER_ROOT, "tests/unit");

// 8 measured best locally (4.1s vs 5.3s at 16 shards on an M-series Mac) —
// past one shard per core, extra shards just duplicate the import graph.
const SHARD_COUNT = Math.max(
	2,
	Math.min(Number(process.env.UNIT_SHARDS) || 8, 16),
);

const isTestFile = (name: string) =>
	!name.startsWith(".") && /\.(test|spec)\.tsx?$/.test(name);

const listTestFiles = (dir: string): string[] => {
	const files: string[] = [];
	for (const entry of readdirSync(dir).sort()) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) files.push(...listTestFiles(full));
		else if (isTestFile(entry)) files.push(path.relative(SERVER_ROOT, full));
	}
	return files;
};

type Group = { paths: string[]; weight: number };

// Explicit file lists, never directory filters — `bun test` treats positional
// args as substring filters, so `tests/unit/redis` would also (re-)run
// everything under tests/unit/redis-otel.
//
// Groups are cut two directory levels deep (tests/unit/<dir>/<subdir>) so
// big dirs like balances don't pin all their weight — and their slow files —
// onto one shard. Files sharing a group keep their relative order.
const collectGroups = (): Group[] => {
	const groups: Group[] = [];
	const pushGroup = (files: string[]) => {
		if (files.length > 0) groups.push({ paths: files, weight: files.length });
	};

	const rootFiles: string[] = [];
	for (const entry of readdirSync(UNIT_ROOT).sort()) {
		const full = path.join(UNIT_ROOT, entry);
		if (!statSync(full).isDirectory()) {
			if (isTestFile(entry)) rootFiles.push(path.relative(SERVER_ROOT, full));
			continue;
		}
		const directFiles: string[] = [];
		for (const child of readdirSync(full).sort()) {
			const childFull = path.join(full, child);
			if (statSync(childFull).isDirectory()) {
				pushGroup(listTestFiles(childFull));
			} else if (isTestFile(child)) {
				directFiles.push(path.relative(SERVER_ROOT, childFull));
			}
		}
		pushGroup(directFiles);
	}
	pushGroup(rootFiles);
	return groups;
};

const packShards = (groups: Group[]): string[][] => {
	const shards = Array.from({ length: SHARD_COUNT }, () => ({
		paths: [] as string[],
		weight: 0,
	}));
	for (const group of [...groups].sort((a, b) => b.weight - a.weight)) {
		const lightest = shards.reduce((min, shard) =>
			shard.weight < min.weight ? shard : min,
		);
		lightest.paths.push(...group.paths);
		lightest.weight += group.weight;
	}
	return shards.filter((shard) => shard.paths.length > 0).map((s) => s.paths);
};

const runShard = async (paths: string[]) => {
	const shardStartedAt = performance.now();
	const proc = Bun.spawn(["bun", "test", ...paths], {
		cwd: SERVER_ROOT,
		env: {
			...process.env,
			UNIT_TESTS: "1",
			// Lets the preload seed only the modules this shard's files mock.
			UNIT_TEST_FILES: paths.join("\n"),
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	const elapsedMs = performance.now() - shardStartedAt;
	return { paths, stdout, stderr, exitCode, elapsedMs };
};

const startedAt = performance.now();
const shards = packShards(collectGroups());
const results = await Promise.all(shards.map(runShard));

let failed = false;
for (const result of results) {
	if (result.exitCode === 0) continue;
	failed = true;
	console.error(`\n--- FAILED shard: ${result.paths.join(" ")} ---`);
	console.error(result.stdout);
	console.error(result.stderr);
}

const summaryFor = (text: string) => {
	const match = text.match(
		/(\d+) pass\n(?:\s*(\d+) skip\n)?(?:\s*(\d+) todo\n)?\s*(\d+) fail[\s\S]*?Ran (\d+) tests? across (\d+) files?\.\s*\[(.+)\]/,
	);
	return match
		? {
				pass: Number(match[1]),
				skip: Number(match[2] ?? 0) + Number(match[3] ?? 0),
				fail: Number(match[4]),
				tests: Number(match[5]),
				files: Number(match[6]),
			}
		: null;
};

let totalPass = 0;
let totalSkip = 0;
let totalFail = 0;
let totalTests = 0;
let totalFiles = 0;
for (const result of results) {
	const summary = summaryFor(result.stderr) ?? summaryFor(result.stdout);
	if (summary) {
		totalPass += summary.pass;
		totalSkip += summary.skip;
		totalFail += summary.fail;
		totalTests += summary.tests;
		totalFiles += summary.files;
	}
}

for (const [index, result] of results.entries()) {
	const first = result.paths[0]?.replace("tests/unit/", "").split("/")[0];
	console.log(
		`shard ${index + 1}: ${(result.elapsedMs / 1000).toFixed(2)}s, ${result.paths.length} files (${first}, …)`,
	);
}

const elapsed = ((performance.now() - startedAt) / 1000).toFixed(2);
const skipNote = totalSkip > 0 ? `, ${totalSkip} skipped` : "";
console.log(
	`\nUnit tests: ${totalPass} passed, ${totalFail} failed${skipNote} (${totalTests} total across ${totalFiles} files, ${shards.length} shards) [${elapsed}s]`,
);

if (failed) process.exit(1);
if (totalTests === 0) {
	console.error("No unit tests ran — shard collection is broken.");
	process.exit(1);
}

// Staging-only bench entry for the shadow's c8g machines (throwaway branch, never merge).
// Serves /health so the platform keeps it up, runs the bench matrix with this binary as Bun, and re-prints results.
import { mkdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import hotSource from "../bench-dist/hotCustomerBench.js" with { type: "text" };
import multiWorkerAutumnSource from "../bench-dist/multiWorkerAutumn.js" with { type: "text" };
import stagesSource from "../bench-dist/stagesBench.js" with { type: "text" };
import workerAutumnSource from "../bench-dist/workerAutumn.js" with { type: "text" };
import bunfigSource from "../bunfig.toml" with { type: "text" };

const RUN_DIR = process.env.BENCH_DIR ?? "/data/atom-graviton-bench";
const REPRINT_EVERY_MS = 30_000;
const REPRINT_FOR_MS = 15 * 60_000;

Bun.serve({
	hostname: "0.0.0.0",
	port: Number(process.env.ATOM_PORT ?? 8080),
	fetch: () => Response.json({ status: "alive", bench: "atom-graviton-bench" }),
});

mkdirSync(`${RUN_DIR}/tmp`, { recursive: true });
writeFileSync(`${RUN_DIR}/stagesBench.js`, stagesSource);
writeFileSync(`${RUN_DIR}/multiWorkerAutumn.ts`, multiWorkerAutumnSource);
writeFileSync(`${RUN_DIR}/hotCustomerBench.js`, hotSource);
writeFileSync(`${RUN_DIR}/workerAutumn.js`, workerAutumnSource);
writeFileSync(`${RUN_DIR}/bunfig.toml`, bunfigSource);

const cpuModel =
	(await Bun.file("/proc/cpuinfo").text())
		.split("\n")
		.find((line) => /CPU part|model name/i.test(line)) ?? "unknown";
const machine = { host: hostname(), arch: process.arch, bun: Bun.version, revision: Bun.revision, cpuModel };
const results: string[] = [];

const emit = (line: string) => console.log(`BENCHRESULT ${line}`);

const runOne = async ({ kind, round, args }: { kind: string; round: number; args: string[] }) => {
	const child = Bun.spawn([process.execPath, `${RUN_DIR}/${kind}.js`, ...args], {
		cwd: RUN_DIR,
		env: { ...process.env, BUN_BE_BUN: "1", NODE_ENV: "production", TMPDIR: `${RUN_DIR}/tmp` },
		stdout: "pipe",
		stderr: "ignore",
	});
	const out = await new Response(child.stdout).text();
	const exitCode = await child.exited;
	const json = out
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("{"));
	const line = JSON.stringify({ machine, kind, round, args, exitCode, result: json.length ? JSON.parse(json.join("")) : null });
	results.push(line);
	emit(line);
};

emit(JSON.stringify({ machine, phase: "start" }));
for (let round = 1; round <= 3; round++)
	for (const shape of ["simple", "complex"])
		for (const rate of ["1000", "1500"])
			await runOne({ kind: "stagesBench", round, args: [rate, "20", shape, "1500", "0.2"] });
for (const rate of ["500", "1000", "1500"])
	for (let round = 1; round <= 3; round++)
		await runOne({ kind: "hotCustomerBench", round, args: [rate, "20", "1500"] });
emit(JSON.stringify({ machine, phase: "done", runs: results.length }));

const startedAt = Date.now();
const timer = setInterval(() => {
	for (const line of results) emit(line);
	if (Date.now() - startedAt > REPRINT_FOR_MS) clearInterval(timer);
}, REPRINT_EVERY_MS);

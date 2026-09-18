import { cp, mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Client } from "eve/client";
import { cleanupOwnedHosts } from "../scripts/suite.js";
import { startNativeBridge } from "./lib/bridge.js";
import type { NativeMode } from "./lib/protocol.js";

const mode = process.env.LEAF_LAB_MODE ?? "jev";
if (!["jev", "flash", "opus"].includes(mode))
	throw new Error("Unknown native lab mode");
if (mode === "jev" && !process.env.TYPESAFE_API_KEY)
	throw new Error("TYPESAFE_API_KEY is required for Jev native evals");
if (process.argv.includes("--eval") && !process.env.OPENROUTER_API_KEY)
	throw new Error("OPENROUTER_API_KEY is required for native model turns");
const runId = `${Date.now()}-${mode}`;
const reportDir = resolve(
	process.env.LEAF_LAB_REPORT_DIR ??
		resolve(homedir(), ".capy/work/leaf-lab-full/native"),
	runId,
);
await mkdir(reportDir, { recursive: true });
const bridge = await startNativeBridge({
	mode: mode as NativeMode,
	reportDir,
	today: process.env.LEAF_NATIVE_TODAY,
});
const portReservation = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch: () => new Response(),
});
const port = portReservation.port;
portReservation.stop(true);
if (!port) {
	await bridge.close();
	throw new Error("Could not reserve a native Eve port");
}
await mkdir(resolve(import.meta.dirname, "node_modules"), { recursive: true });
await symlink(
	resolve(import.meta.dirname, "../node_modules/eve"),
	resolve(import.meta.dirname, "node_modules/eve"),
	"dir",
).catch((error: NodeJS.ErrnoException) => {
	if (error.code !== "EEXIST") throw error;
});
const cli = resolve(import.meta.dirname, "node_modules/eve/bin/eve.js");
const env = {
	...process.env,
	NODE_ENV: "development",
	LEAF_NATIVE_BRIDGE_URL: bridge.url,
	LEAF_NATIVE_BRIDGE_TOKEN: bridge.token,
	LEAF_NATIVE_HOST_URL: `http://127.0.0.1:${port}`,
	LEAF_LAB_REPORT_DIR: reportDir,
	LEAF_LAB_RUN_ID: runId,
	LEAF_NATIVE_MODEL:
		process.env.LEAF_NATIVE_MODEL ??
		(mode === "opus"
			? "anthropic/claude-opus-5"
			: "google/gemini-3.8-flash:nitro"),
};
const hostLog = Bun.file(resolve(reportDir, "host.log"));
const host = Bun.spawn(
	["node", cli, "dev", "--no-ui", "--port", String(port)],
	{ cwd: import.meta.dirname, env, stdout: hostLog, stderr: hostLog },
);
let runner: ReturnType<typeof Bun.spawn> | undefined;
let cleanupPromise: Promise<void> | undefined;
const cleanup = () => {
	if (cleanupPromise) return cleanupPromise;
	cleanupPromise = (async () => {
		if (runner && runner.exitCode === null) {
			runner.kill("SIGTERM");
			await Promise.race([runner.exited, Bun.sleep(2_000)]);
			if (runner.exitCode === null) runner.kill("SIGKILL");
			await runner.exited;
		}
		await cleanupOwnedHosts(import.meta.dirname, reportDir);
		if (host.exitCode === null) host.kill("SIGKILL");
		await host.exited;
		await bridge.close();
	})();
	return cleanupPromise;
};
process.once("SIGTERM", () => {
	void cleanup();
});
process.once("SIGINT", () => {
	void cleanup();
});
try {
	const client = new Client({ host: `http://127.0.0.1:${port}` });
	const deadline = Date.now() + 120_000;
	while (true) {
		if (host.exitCode !== null)
			throw new Error(`Native Eve host exited; see ${reportDir}/host.log`);
		try {
			await client.health();
			break;
		} catch {
			if (Date.now() > deadline)
				throw new Error("Native Eve host did not become healthy");
			await Bun.sleep(500);
		}
	}
	await writeFile(
		resolve(reportDir, "target.json"),
		JSON.stringify(
			{
				runId,
				mode,
				host: `http://127.0.0.1:${port}`,
				reportDir,
				cwd: import.meta.dirname,
			},
			null,
			2,
		),
		{ mode: 0o600 },
	);
	console.log(`Native target ready on port ${port}; reports: ${reportDir}`);
	if (process.argv.includes("--eval")) {
		const artifactRoot = resolve(import.meta.dirname, ".eve/evals");
		const previousArtifacts = new Set(
			await readdir(artifactRoot).catch(() => []),
		);
		const targets = process.argv.slice(process.argv.indexOf("--eval") + 1);
		if (targets.some((target) => !/^[\w/-]+$/.test(target)))
			throw new Error("Expected native eval IDs or directory prefixes");
		runner = Bun.spawn(
			[
				"node",
				cli,
				"eval",
				...targets,
				"--url",
				`http://127.0.0.1:${port}`,
				"--max-concurrency",
				"1",
				"--json",
			],
			{
				cwd: import.meta.dirname,
				env,
				stdout: Bun.file(resolve(reportDir, "eval.stdout.jsonl")),
				stderr: Bun.file(resolve(reportDir, "eval.stderr.log")),
			},
		);
		process.exitCode = await runner.exited;
		for (const entry of await readdir(artifactRoot).catch(() => [])) {
			if (!previousArtifacts.has(entry))
				await cp(
					resolve(artifactRoot, entry),
					resolve(reportDir, "eve-evals", entry),
					{ recursive: true },
				);
		}
	} else if (!process.argv.includes("--check")) {
		process.exitCode = await host.exited;
	}
} finally {
	await cleanup();
}

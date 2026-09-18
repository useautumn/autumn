import { createHash } from "node:crypto";
import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { buildReport, classifyOutcome, invocationEvidence } from "./report.js";

export const repository = resolve(import.meta.dirname, "../../..");
const ignored = new Set([
	"node_modules",
	".git",
	".eve",
	".output",
	"dist",
	".next",
]);

type ProcessEntry = { pid: number; ppid: number; command: string };

export function ownedProcesses(processes: ProcessEntry[], frozenLab: string) {
	const cli = resolve(frozenLab, "node_modules/eve/bin/eve.js");
	const commandPattern = new RegExp(
		`^(?:\\S*/)?node ${cli.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} dev(?:\\s|$)`,
	);
	const owned = processes.filter((process) =>
		commandPattern.test(process.command),
	);
	const ids = new Set(owned.map((process) => process.pid));
	for (let changed = true; changed; ) {
		changed = false;
		for (const entry of processes)
			if (ids.has(entry.ppid) && !ids.has(entry.pid)) {
				ids.add(entry.pid);
				owned.push(entry);
				changed = true;
			}
	}
	return owned;
}

function processTable(): ProcessEntry[] {
	const result = Bun.spawnSync(["ps", "-axo", "pid=,ppid=,command="]);
	if (result.exitCode !== 0)
		throw new Error("Cannot inspect owned Eve processes");
	return result.stdout
		.toString()
		.split("\n")
		.flatMap((line) => {
			const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
			return match
				? [
						{
							pid: Number(match[1]),
							ppid: Number(match[2]),
							command: match[3] ?? "",
						},
					]
				: [];
		});
}

export async function cleanupOwnedHosts(frozenLab: string, directory: string) {
	const owned = ownedProcesses(processTable(), frozenLab);
	const actions: Array<{
		pid: number;
		ppid: number;
		signal: string;
		error?: string;
	}> = [];
	for (const signal of ["SIGTERM", "SIGKILL"] as const) {
		const current = processTable();
		for (const entry of [...owned].reverse()) {
			if (
				!current.some(
					(now) =>
						now.pid === entry.pid &&
						now.command === entry.command &&
						(now.ppid === entry.ppid || now.ppid === 1),
				)
			)
				continue;
			try {
				process.kill(entry.pid, signal);
				actions.push({ pid: entry.pid, ppid: entry.ppid, signal });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH")
					actions.push({
						pid: entry.pid,
						ppid: entry.ppid,
						signal,
						error: String(error),
					});
			}
		}
		if (owned.length) await Bun.sleep(750);
	}
	const current = processTable();
	const remaining = owned.filter((entry) =>
		current.some(
			(now) => now.pid === entry.pid && now.command === entry.command,
		),
	);
	await writeJson(resolve(directory, "host-cleanup.json"), {
		frozenLab,
		startedAt: new Date().toISOString(),
		ownedPids: owned.map(({ pid, ppid }) => ({ pid, ppid })),
		actions,
		remainingPids: remaining.map((entry) => entry.pid),
	});
	if (remaining.length)
		throw new Error(
			"Owned Eve processes survived cleanup; refusing the next invocation",
		);
}

async function executeInvocation(
	invocation: Record<string, unknown>,
	frozenLab: string,
) {
	const directory = invocation.directory as string;
	const started = performance.now();
	try {
		const child = Bun.spawn(invocation.command as string[], {
			cwd: invocation.cwd as string,
			env: {
				...process.env,
				...(invocation.environmentOverrides as Record<string, string>),
			},
			stdout: Bun.file(resolve(directory, "stdout.log")),
			stderr: Bun.file(resolve(directory, "stderr.log")),
		});
		invocation.exitCode = await child.exited;
		invocation.signalCode = child.signalCode;
		invocation.status = child.exitCode === 0 ? "passed" : "failed";
	} catch (error) {
		invocation.status = "failed";
		invocation.error = String(error);
	} finally {
		invocation.processDurationMs = performance.now() - started;
		invocation.finishedAt = new Date().toISOString();
		await writeJson(resolve(directory, "invocation.json"), invocation);
		await cleanupOwnedHosts(frozenLab, directory);
	}
}

export async function resumeInfrastructure(output: string, dryRun: boolean) {
	const manifestPath = resolve(output, "manifest.json");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	if (manifest.status === "running")
		throw new Error(
			"Suite is still running; infrastructure replay requires a completed suite",
		);
	const frozenLab = resolve(output, "frozen/apps/leaf-lab");
	const frozenSource = JSON.parse(
		await readFile(resolve(output, "frozen-source.json"), "utf8"),
	);
	for (const file of frozenSource.files) {
		if (
			createHash("sha256")
				.update(await readFile(resolve(frozenLab, file.path)))
				.digest("hex") !== file.sha256
		)
			throw new Error(`Frozen source changed: ${file.path}`);
	}
	const source = await fingerprint(repository);
	if (source.sha256 !== manifest.sourceFingerprint)
		throw new Error(
			"Shared source changed since original suite; refusing an incomparable replay",
		);
	const latest = new Map<string, Record<string, unknown>>();
	for (const invocation of manifest.invocations)
		latest.set(
			`${invocation.arm}:${invocation.repeat}:${invocation.target}`,
			invocation,
		);
	const selected = [];
	for (const invocation of latest.values()) {
		if (
			classifyOutcome(
				String(invocation.status),
				await invocationEvidence(String(invocation.directory)),
			) === "host-startup-infrastructure"
		)
			selected.push(invocation);
	}
	const plan = {
		startedAt: new Date().toISOString(),
		command: [process.execPath, ...process.argv.slice(1)],
		dryRun,
		retryOf: selected.map((invocation) => invocation.id),
		frozenLab,
		sourceFingerprint: source.sha256,
	};
	await writeJson(
		resolve(output, `resume-plan-${Date.now()}-${crypto.randomUUID()}.json`),
		plan,
	);
	console.log(JSON.stringify(plan, null, 2));
	if (dryRun || !selected.length) return;
	const lock = resolve(output, ".infrastructure-replay-lock");
	await mkdir(lock);
	try {
		manifest.status = "running";
		await writeJson(manifestPath, manifest);
		for (const original of selected) {
			const id = `${original.id}-infra-retry-${crypto.randomUUID()}`;
			const directory = resolve(output, id);
			await mkdir(directory, { mode: 0o700 });
			const invocation = {
				...original,
				id,
				directory,
				retryOf: original.id,
				startedAt: new Date().toISOString(),
				finishedAt: null,
				processDurationMs: null,
				exitCode: null,
				signalCode: null,
				status: "running",
				command: [
					process.execPath,
					resolve(frozenLab, "scripts/eval.ts"),
					String(original.target),
				],
				environmentOverrides: {
					...(original.environmentOverrides as Record<string, string>),
					LEAF_LAB_REPORT_DIR: directory,
					LEAF_LAB_SCORES_FILE: resolve(directory, "scores.json"),
					LEAF_LAB_DRIVER_MODULE: resolve(frozenLab, "lib/evalDriver.ts"),
				},
			};
			manifest.invocations.push(invocation);
			await writeJson(resolve(directory, "invocation.json"), invocation);
			await writeJson(manifestPath, manifest);
			await executeInvocation(invocation, frozenLab);
			await writeJson(manifestPath, manifest);
			await buildReport(output);
		}
		manifest.finishedAt = new Date().toISOString();
		manifest.status = "completed-with-failures";
		await writeJson(manifestPath, manifest);
		await buildReport(output);
	} finally {
		await rm(lock, { recursive: true });
	}
}

export async function freezeLab(root: string, output: string) {
	const frozen = resolve(output, "frozen");
	const lab = resolve(frozen, "apps/leaf-lab");
	await mkdir(lab, { recursive: true, mode: 0o700 });
	const hashes = [];
	for (const path of await filesUnder(resolve(root, "apps/leaf-lab"))) {
		if (!/\.(ts|tsx|js|json|md|yaml|yml)$/.test(path)) continue;
		const name = relative(resolve(root, "apps/leaf-lab"), path);
		const destination = resolve(lab, name);
		await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
		await copyFile(path, destination);
		hashes.push({
			path: name,
			sha256: createHash("sha256")
				.update(await readFile(destination))
				.digest("hex"),
		});
	}
	for (const path of [
		"apps/leaf",
		"packages",
		"shared",
		"server",
		"node_modules",
		"apps/leaf-lab/node_modules",
	])
		await symlink(resolve(root, path), resolve(frozen, path));
	await writeJson(resolve(output, "frozen-source.json"), {
		files: hashes,
		sha256: createHash("sha256").update(JSON.stringify(hashes)).digest("hex"),
		sharedDependencies: [
			"apps/leaf",
			"packages",
			"shared",
			"server/src/internal/billing/v2/actions/createSchedule/errors",
			"node_modules",
			"apps/leaf-lab/node_modules",
		],
	});
	return lab;
}

export async function filesUnder(root: string): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await readdir(root, { withFileTypes: true })) {
		if (ignored.has(entry.name) || entry.name.startsWith(".env")) continue;
		const path = resolve(root, entry.name);
		if (entry.isDirectory()) files.push(...(await filesUnder(path)));
		else if (entry.isFile()) files.push(path);
	}
	return files.sort();
}

export function options(args: string[]) {
	const result = {
		output: resolve(homedir(), ".capy/work/leaf-lab-suites"),
		arms: ["opus", "jev"],
		targets: [] as string[],
		execution: "single",
		repeats: 1,
		dryRun: false,
		corpus: "unspecified",
		correctionsFile: "",
		originalSourceArchive: "",
		originalSourceSha256: "",
	};
	for (let i = 0; i < args.length; i++) {
		const flag = args[i];
		if (flag === "--dry-run") {
			result.dryRun = true;
			continue;
		}
		const value = args[++i];
		if (!value) throw new Error(`Missing value for ${flag}`);
		if (flag === "--output") result.output = resolve(value);
		else if (flag === "--arms") result.arms = value.split(",");
		else if (flag === "--target") result.targets.push(value);
		else if (flag === "--execution") result.execution = value;
		else if (flag === "--repeats") result.repeats = Number(value);
		else if (flag === "--corpus") result.corpus = value;
		else if (flag === "--corrections-file")
			result.correctionsFile = resolve(value);
		else if (flag === "--original-source-archive")
			result.originalSourceArchive = resolve(value);
		else if (flag === "--original-source-sha256")
			result.originalSourceSha256 = value;
		else throw new Error(`Unknown option ${flag}`);
	}
	if (
		!result.arms.length ||
		result.arms.some((arm) => !["opus", "jev"].includes(arm)) ||
		new Set(result.arms).size !== result.arms.length
	)
		throw new Error("Expected unique --arms opus,jev");
	if (!["single", "loop"].includes(result.execution))
		throw new Error("Expected --execution single or loop");
	if (!Number.isSafeInteger(result.repeats) || result.repeats < 1)
		throw new Error("Expected positive integer --repeats");
	if (!["unspecified", "original", "corrected"].includes(result.corpus))
		throw new Error("Expected --corpus original, corrected or unspecified");
	if (
		result.corpus === "corrected" &&
		(!result.correctionsFile ||
			!result.originalSourceArchive ||
			!/^[a-f0-9]{64}$/.test(result.originalSourceSha256))
	)
		throw new Error(
			"Corrected corpus requires --corrections-file, --original-source-archive and --original-source-sha256",
		);
	if (
		result.output === repository ||
		result.output.startsWith(`${repository}/`)
	)
		throw new Error("Artifacts must be outside the repository");
	return result;
}

export async function writeJson(path: string, value: unknown) {
	await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2), {
		mode: 0o600,
	});
	await rename(`${path}.tmp`, path);
}

export async function fingerprint(root: string) {
	const files = (
		await Promise.all(
			[
				"apps/leaf",
				"packages/mcp",
				"packages/agent-docs",
				"shared",
				"server/src/internal/billing/v2/actions/createSchedule/errors",
			].map(async (path) => {
				try {
					return await filesUnder(resolve(root, path));
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
					throw error;
				}
			}),
		)
	)
		.flat()
		.filter((path) => /\.(ts|tsx|js|json|md|yaml|yml|pdf)$/.test(path));
	for (const name of ["bun.lock", "package.json"])
		files.push(resolve(root, name));
	const entries = await Promise.all(
		files.sort().map(async (path) => ({
			path: relative(root, path),
			sha256: createHash("sha256")
				.update(await readFile(path))
				.digest("hex"),
		})),
	);
	return {
		sha256: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
		files: entries,
	};
}

export async function corpusProvenance(
	config: ReturnType<typeof options>,
	output: string,
	source: Awaited<ReturnType<typeof fingerprint>>,
) {
	const files = source.files.filter(
		(file) =>
			file.path.startsWith("apps/leaf/tests/evals/") ||
			file.path.startsWith("apps/leaf/contracts/"),
	);
	const provenance = {
		classification: config.corpus,
		corpusFingerprint: createHash("sha256")
			.update(JSON.stringify(files))
			.digest("hex"),
		files,
		originalSourceArchive: null as { path: string; sha256: string } | null,
		corrections: null as {
			path: string;
			sha256: string;
			savedAs: string;
		} | null,
		interpretation:
			config.corpus === "corrected"
				? "Approved corrected fixtures/scenarios; not the unchanged original corpus. Both arms must use this same corpus fingerprint."
				: "Corpus identity is defined by these file hashes; labels alone do not establish equivalence with a previous suite.",
	};
	if (config.originalSourceArchive) {
		const sha256 = createHash("sha256")
			.update(await readFile(config.originalSourceArchive))
			.digest("hex");
		if (sha256 !== config.originalSourceSha256)
			throw new Error(
				"Original-source archive SHA-256 does not match the supplied provenance hash",
			);
		provenance.originalSourceArchive = {
			path: config.originalSourceArchive,
			sha256,
		};
	}
	if (config.correctionsFile) {
		const bytes = await readFile(config.correctionsFile);
		const savedAs = "FIXTURE_CORRECTIONS.md";
		await writeFile(resolve(output, savedAs), bytes, { mode: 0o600 });
		provenance.corrections = {
			path: config.correctionsFile,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			savedAs,
		};
	}
	await writeJson(resolve(output, "corpus-provenance.json"), provenance);
	return provenance;
}

export async function runSuite(args: string[]) {
	const config = options(args);
	const evalRoot = resolve(repository, "apps/leaf/tests/evals");
	const inventory = (await filesUnder(resolve(repository, "apps/leaf")))
		.filter((path) => path.endsWith(".eval.ts"))
		.map((path) => ({
			path: relative(repository, path),
			category: path.startsWith(`${evalRoot}/`)
				? "fixture-harness"
				: "native-eve-not-driver-compatible",
		}));
	const availableTargets = inventory
		.filter((entry) => entry.category === "fixture-harness")
		.map((entry) => relative(evalRoot, resolve(repository, entry.path)));
	if (new Set(config.targets).size !== config.targets.length)
		throw new Error("Duplicate --target; use --repeats for repeated runs");
	for (const target of config.targets)
		if (!availableTargets.includes(target))
			throw new Error(`Unknown fixture eval target: ${target}`);
	const targets = config.targets.length ? config.targets : availableTargets;
	if (!targets.length) throw new Error("No fixture evals found");
	const output = resolve(
		config.output,
		`${new Date().toISOString().replaceAll(":", "-")}-${crypto.randomUUID()}`,
	);
	await mkdir(output, { recursive: true, mode: 0o700 });
	const frozenLab = await freezeLab(repository, output);
	const source = await fingerprint(repository);
	await writeJson(resolve(output, "source.json"), source);
	const provenance = await corpusProvenance(config, output, source);
	const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: repository });
	const manifest = {
		schemaVersion: 1,
		startedAt: new Date().toISOString(),
		finishedAt: null as string | null,
		status: "running",
		command: [process.execPath, ...process.argv.slice(1)],
		cwd: repository,
		runtime: {
			bun: Bun.version,
			platform: process.platform,
			arch: process.arch,
		},
		gitHead: git.stdout.toString().trim(),
		sourceFingerprint: source.sha256,
		corpusProvenance: provenance,
		config,
		inventory,
		invocations: [] as Array<Record<string, unknown>>,
	};
	const persist = () => writeJson(resolve(output, "manifest.json"), manifest);
	await persist();
	console.log(`Suite artifacts: ${output}`);
	for (const arm of config.arms) {
		for (let repeat = 1; repeat <= config.repeats; repeat++) {
			for (const target of targets) {
				if (
					!config.dryRun &&
					(await fingerprint(repository)).sha256 !== source.sha256
				) {
					manifest.status = "source-changed";
					manifest.finishedAt = new Date().toISOString();
					await writeJson(
						resolve(output, "source-final.json"),
						await fingerprint(repository),
					);
					await persist();
					await buildReport(output);
					throw new Error(
						"Shared fixture/dependency source changed; stopped before the next paid invocation",
					);
				}
				const id = `${String(manifest.invocations.length + 1).padStart(3, "0")}-${arm}-${repeat}-${target.replaceAll("/", "_")}`;
				const directory = resolve(output, id);
				await mkdir(directory, { mode: 0o700 });
				const env = {
					LEAF_LAB_MODE: arm,
					LEAF_LAB_EXECUTION: arm === "opus" ? "loop" : config.execution,
					LEAF_LAB_JEV_MODEL: process.env.LEAF_LAB_JEV_MODEL ?? "jev-latest",
					LEAF_LAB_REPORT_DIR: directory,
					LEAF_LAB_SCORES_FILE: resolve(directory, "scores.json"),
					LEAF_LAB_DRIVER_MODULE: resolve(frozenLab, "lib/evalDriver.ts"),
					LEAF_EVAL_DRIVER: "eve-lab",
					EVAL_FAIL_ON_SCORE: "1",
					EVAL_TIMEOUT_MS: process.env.EVAL_TIMEOUT_MS ?? "240000",
				};
				const command = [
					process.execPath,
					resolve(repository, "apps/leaf-lab/scripts/eval.ts"),
					target,
				];
				const invocation: Record<string, unknown> = {
					id,
					arm,
					repeat,
					target,
					directory,
					command,
					cwd: resolve(repository, "apps/leaf"),
					environmentOverrides: env,
					model:
						arm === "opus"
							? "anthropic/claude-opus-5"
							: "google/gemini-3.8-flash:nitro",
					corpusFingerprint: provenance.corpusFingerprint,
					corpusClassification: provenance.classification,
					startedAt: new Date().toISOString(),
					status: config.dryRun ? "planned" : "running",
				};
				manifest.invocations.push(invocation);
				await writeJson(resolve(directory, "invocation.json"), invocation);
				await persist();
				if (config.dryRun) continue;
				await executeInvocation(invocation, frozenLab);
				await persist();
				await buildReport(output);
				console.log(`${id}: ${invocation.status}`);
			}
		}
	}
	const finalSource = await fingerprint(repository);
	await writeJson(resolve(output, "source-final.json"), finalSource);
	manifest.finishedAt = new Date().toISOString();
	manifest.status = config.dryRun
		? "dry-run"
		: finalSource.sha256 !== source.sha256
			? "source-changed"
			: manifest.invocations.some((run) => run.status === "failed")
				? "completed-with-failures"
				: "completed";
	await persist();
	await buildReport(output);
	if (!["completed", "dry-run"].includes(manifest.status)) process.exitCode = 1;
	return output;
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	if (args[0] === "--resume-infra") {
		if (!args[1] || args.slice(2).some((arg) => arg !== "--dry-run"))
			throw new Error(
				"Usage: suite.ts --resume-infra SUITE_DIRECTORY [--dry-run]",
			);
		await resumeInfrastructure(resolve(args[1]), args.includes("--dry-run"));
	} else await runSuite(args);
}

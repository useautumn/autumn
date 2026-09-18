import { createHash } from "node:crypto";
import {
	chmod,
	copyFile,
	mkdir,
	readdir,
	readFile,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { cleanupOwnedHosts, freezeLab, repository } from "../scripts/suite.js";

const mode = process.env.LEAF_LAB_MODE ?? "opus";
if (!["opus", "flash", "jev"].includes(mode))
	throw new Error("Unknown native suite mode");
const targets = process.argv.slice(2);
if (targets.some((target) => !/^[\w/-]+$/.test(target)))
	throw new Error("Expected eval IDs or directory prefixes");
const output = resolve(
	process.env.LEAF_NATIVE_SUITE_DIR ??
		resolve(
			homedir(),
			".capy/work/leaf-lab-full/native",
			`suite-${Date.now()}-${mode}`,
		),
);
await mkdir(output, { recursive: true, mode: 0o700 });
const frozenLab = await freezeLab(repository, output);
const frozenSource = JSON.parse(
	await readFile(resolve(output, "frozen-source.json"), "utf8"),
) as { files: Array<{ path: string; sha256: string }>; sha256: string };
for (const file of frozenSource.files)
	await chmod(resolve(frozenLab, file.path), 0o400);
const assertions: Array<{ path: string; sha256: string }> = [];
const copyAssertions = async (directory: string) => {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const source = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			await copyAssertions(source);
			continue;
		}
		if (!entry.name.endsWith(".ts")) continue;
		const path = relative(repository, source);
		const destination = resolve(output, "assertion-source", path);
		await mkdir(dirname(destination), { recursive: true });
		await copyFile(source, destination);
		await chmod(destination, 0o400);
		assertions.push({
			path,
			sha256: createHash("sha256")
				.update(await readFile(source))
				.digest("hex"),
		});
	}
};
await copyAssertions(resolve(repository, "apps/leaf/evals"));
await copyAssertions(resolve(repository, "apps/leaf-lab/native/evals"));
const command = [
	process.execPath,
	resolve(frozenLab, "native/launch.ts"),
	"--eval",
	...targets,
];
const environmentOverrides = {
	LEAF_LAB_MODE: mode,
	LEAF_LAB_REPORT_DIR: resolve(output, "runs"),
	LEAF_NATIVE_MODEL:
		process.env.LEAF_NATIVE_MODEL ??
		(mode === "opus"
			? "anthropic/claude-opus-5"
			: "google/gemini-3.8-flash:nitro"),
};
const manifest: Record<string, unknown> = {
	definitionLabel: "corrected-definition",
	definitionCorrections: [
		{
			caseId: "agent/follow-up-carry-over",
			original: "apps/leaf/evals/agent/follow-up-carry-over.eval.ts",
			corrected:
				"apps/leaf-lab/native/evals/agent/follow-up-carry-over.eval.ts",
			reason:
				"Retain the unchanged original approval instead of requiring a duplicate second-turn gate; original results remain separate.",
		},
	],
	mode,
	model: environmentOverrides.LEAF_NATIVE_MODEL,
	command,
	cwd: frozenLab,
	environmentOverrides,
	frozenSourceHash: frozenSource.sha256,
	assertions,
	seed: "Modeled isolated native org; see each run's seed-provenance.json, not recovered real-catalog accuracy",
	startedAt: new Date().toISOString(),
	status: "running",
};
await writeFile(
	resolve(output, "invocation.json"),
	JSON.stringify(manifest, null, 2),
	{ mode: 0o600 },
);
console.log(`Frozen native ${mode} suite: ${output}`);
let child: ReturnType<typeof Bun.spawn> | undefined;
process.once("SIGTERM", () => child?.kill("SIGTERM"));
process.once("SIGINT", () => child?.kill("SIGTERM"));
const started = performance.now();
try {
	child = Bun.spawn(command, {
		cwd: frozenLab,
		env: { ...process.env, ...environmentOverrides },
		stdout: Bun.file(resolve(output, "stdout.log")),
		stderr: Bun.file(resolve(output, "stderr.log")),
	});
	manifest.exitCode = await child.exited;
	manifest.status = child.exitCode === 0 ? "passed" : "failed";
	process.exitCode = child.exitCode ?? 1;
} catch (error) {
	manifest.status = "failed";
	manifest.error = String(error);
	process.exitCode = 1;
} finally {
	manifest.durationMs = performance.now() - started;
	manifest.finishedAt = new Date().toISOString();
	await cleanupOwnedHosts(resolve(frozenLab, "native"), output);
	manifest.assertionsUnchanged = (
		await Promise.all(
			assertions.map(
				async ({ path, sha256 }) =>
					createHash("sha256")
						.update(await readFile(resolve(repository, path)))
						.digest("hex") === sha256,
			),
		)
	).every(Boolean);
	manifest.frozenSourceUnchanged = (
		await Promise.all(
			frozenSource.files.map(
				async ({ path, sha256 }) =>
					createHash("sha256")
						.update(await readFile(resolve(frozenLab, path)))
						.digest("hex") === sha256,
			),
		)
	).every(Boolean);
	await writeFile(
		resolve(output, "invocation.json"),
		JSON.stringify(manifest, null, 2),
		{ mode: 0o600 },
	);
}
console.log(`${mode} native suite ${manifest.status}: ${output}`);

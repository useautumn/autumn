import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { removeEnvLocalFiles } from "../dw/helpers/env-files.ts";
import { deleteBranch, findBranchByName } from "../dw/helpers/neon.ts";
import { fatal, log, sh } from "../dw/helpers/shell.ts";
import { cmdCapyStop, ensureBunGlobalBin } from "./command.ts";
import { getMachineId, stateForMachine } from "./machineIdentity.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const CAPY_PREFIX =
	process.env.CAPY_PREFIX ??
	join(process.env.HOME ?? "/home/user", ".autumn-capy");
const KEPT_PREFIX_ENTRIES = new Set(["opt-ins"]);

/** Only this machine's branch: a state.json baked into a snapshot names another machine's. */
function ownNeonBranchName(): string | undefined {
	const statePath = join(CAPY_PREFIX, "state.json");
	if (!existsSync(statePath)) return undefined;
	const state = JSON.parse(readFileSync(statePath, "utf-8")) as {
		machineId: string;
		branchName?: string;
	};
	return stateForMachine({
		state,
		machineId: getMachineId({ prefix: CAPY_PREFIX }),
	})?.branchName;
}

function removeComposeProjects(): void {
	const triggerEnv = join(CAPY_PREFIX, "trigger.env");
	const projects = [
		{ name: "autumn-capy", file: "scripts/setup/dw.compose.yml", envFile: [] },
		{
			name: "autumn-capy-trigger",
			file: "scripts/setup/trigger.compose.yml",
			envFile: existsSync(triggerEnv) ? ["--env-file", triggerEnv] : [],
		},
	];
	for (const { name, file, envFile } of projects) {
		const res = sh(
			"docker",
			[
				"compose",
				...envFile,
				"-f",
				join(REPO_ROOT, file),
				"-p",
				name,
				"down",
				"--volumes",
				"--remove-orphans",
			],
			// `down` never pulls, but the trigger compose file refuses to parse without a tag.
			{
				cwd: REPO_ROOT,
				env: { TRIGGER_IMAGE_TAG: "teardown", ...process.env } as Record<
					string,
					string
				>,
			},
		);
		if (res.code !== 0)
			fatal(`docker compose down ${name} failed:\n${res.stderr}`);
		log(`removed docker compose project ${name} and its volumes`);
	}
}

function stopKafka(): void {
	const res = sh(
		"bash",
		["-c", ". scripts/setup/capy-kafka.sh && stop_capy_kafka"],
		{
			cwd: REPO_ROOT,
			env: { ...process.env, CAPY_PREFIX } as Record<string, string>,
		},
	);
	if (res.code !== 0) fatal(`stopping kafka failed:\n${res.stderr}`);
	log("stopped kafka");
}

function clearCapyPrefix(): void {
	if (!existsSync(CAPY_PREFIX)) return;
	for (const entry of readdirSync(CAPY_PREFIX)) {
		if (KEPT_PREFIX_ENTRIES.has(entry)) continue;
		rmSync(join(CAPY_PREFIX, entry), { recursive: true, force: true });
	}
	log(`cleared ${CAPY_PREFIX} (kept opt-ins)`);
}

function assertStartupIdle(): void {
	const lock = join(CAPY_PREFIX, "startup.lock");
	if (!existsSync(lock)) return;
	if (sh("flock", ["-n", lock, "true"]).code !== 0) {
		fatal("Capy startup is running; wait for it to finish, then tear down");
	}
}

/** Returns the machine to its pre-startup state; the next startup or `bun capy` rebuilds it all. */
export function cmdCapyTeardown(): void {
	assertStartupIdle();
	ensureBunGlobalBin();
	cmdCapyStop();
	const branchName = ownNeonBranchName();
	if (branchName && findBranchByName(branchName)) {
		deleteBranch(branchName);
		// Provision adopts a surviving branch by name, which would silently keep the old data.
		if (findBranchByName(branchName)) {
			fatal(
				`Neon branch ${branchName} still exists; teardown stopped before clearing state`,
			);
		}
	} else log("no Neon branch to delete for this machine");
	removeComposeProjects();
	stopKafka();
	rmSync(join(REPO_ROOT, ".data", "atom"), { recursive: true, force: true });
	removeEnvLocalFiles();
	clearCapyPrefix();
	log("capy teardown complete — run `bun capy` to rebuild from scratch");
}

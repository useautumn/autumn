import { join } from "node:path";
import { sh, log } from "./shell.ts";
import { composeProjectName, dragonflyPortFor, elasticMqPortFor } from "./ports.ts";
import { SCRIPT_DIR } from "../constants.ts";

const composeFilePath = join(SCRIPT_DIR, "../setup/dw.compose.yml");

export function dockerComposeAvailable(): boolean {
	const res = sh("docker", ["compose", "version"]);
	return res.code === 0;
}

export function ensureComposeStack(worktreeNum: number): void {
	if (worktreeNum === 1) return;
	if (!dockerComposeAvailable()) {
		log("docker compose not available; skipping infra stack");
		return;
	}

	const project = composeProjectName(worktreeNum);
	const dragonflyPort = String(dragonflyPortFor(worktreeNum));
	const elasticMqPort = String(elasticMqPortFor(worktreeNum));

	const env = {
		...(process.env as Record<string, string>),
		COMPOSE_PROJECT_NAME: project,
		DRAGONFLY_PORT: dragonflyPort,
		ELASTICMQ_PORT: elasticMqPort,
	};

	const up = sh(
		"docker",
		["compose", "-f", composeFilePath, "-p", project, "up", "-d"],
		{ env },
	);
	if (up.code === 0) {
		log(
			`compose stack ${project} up (dragonfly :${dragonflyPort}, elasticmq :${elasticMqPort})`,
		);
	} else {
		console.error(
			`[dw] failed to start compose stack ${project}: ${up.stderr}`,
		);
	}
}

export function removeComposeStack(worktreeNum: number): void {
	if (worktreeNum === 1) return;
	const project = composeProjectName(worktreeNum);
	const down = sh("docker", [
		"compose",
		"-f",
		composeFilePath,
		"-p",
		project,
		"down",
		"-v",
	]);
	if (down.code === 0) {
		log(`removed compose stack ${project}`);
	}
}

export function removeAllAutumnComposeStacks(): void {
	if (!dockerComposeAvailable()) return;
	const ls = sh("docker", [
		"compose",
		"ls",
		"--filter",
		"name=autumn-wt-",
		"--format",
		"json",
	]);
	if (ls.code !== 0 || !ls.stdout) return;
	try {
		const projects = JSON.parse(ls.stdout) as { Name: string }[];
		for (const p of projects) {
			const down = sh("docker", [
				"compose",
				"-f",
				composeFilePath,
				"-p",
				p.Name,
				"down",
				"-v",
			]);
			if (down.code === 0) {
				log(`removed compose stack ${p.Name}`);
			} else {
				console.error(
					`[dw] failed to remove compose stack ${p.Name}: ${down.stderr}`,
				);
			}
		}
	} catch {
		/* JSON parse failed, ignore */
	}
}

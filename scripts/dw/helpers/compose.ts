import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "../constants.ts";
import { getCanonicalWorktree } from "./git.ts";
import {
	composeProjectName,
	dragonflyPortFor,
	dynamoDbPortFor,
	elasticMqPortFor,
} from "./ports.ts";
import { log, sh } from "./shell.ts";

function getComposeFilePath(): string {
	const canonicalPath = join(
		getCanonicalWorktree(),
		"scripts/setup/dw.compose.yml",
	);
	if (existsSync(canonicalPath)) return canonicalPath;

	return join(PROJECT_ROOT, "scripts/setup/dw.compose.yml");
}

const composeFilePath = getComposeFilePath();

export function dockerComposeAvailable(): boolean {
	const res = sh("docker", ["compose", "version"]);
	return res.code === 0;
}

function composeEnv(worktreeNum: number): Record<string, string> {
	return {
		...(process.env as Record<string, string>),
		COMPOSE_PROJECT_NAME: composeProjectName(worktreeNum),
		DRAGONFLY_PORT: String(dragonflyPortFor(worktreeNum)),
		ELASTICMQ_PORT: String(elasticMqPortFor(worktreeNum)),
		DYNAMODB_PORT: String(dynamoDbPortFor(worktreeNum)),
	};
}

export function ensureComposeStack(
	worktreeNum: number,
	branchName: string | undefined,
): void {
	if (worktreeNum === 1 && !branchName) return;
	if (!dockerComposeAvailable()) {
		log("docker compose not available; skipping infra stack");
		return;
	}

	const project = composeProjectName(worktreeNum);
	const env = composeEnv(worktreeNum);
	const up = sh(
		"docker",
		["compose", "-f", composeFilePath, "-p", project, "up", "-d"],
		{ env },
	);
	if (up.code === 0) {
		log(
			`compose stack ${project} up (dragonfly :${env.DRAGONFLY_PORT}, elasticmq :${env.ELASTICMQ_PORT}, dynamodb :${env.DYNAMODB_PORT})`,
		);
	} else {
		console.error(
			`[dw] failed to start compose stack ${project}: ${up.stderr}`,
		);
	}
}

function composeDown(project: string, extra: string[] = []): number {
	return sh("docker", [
		"compose",
		"-f",
		composeFilePath,
		"-p",
		project,
		"--profile",
		"ngrok",
		"down",
		...extra,
	]).code;
}

export function removeComposeStack(
	worktreeNum: number,
	branchName: string | undefined,
): void {
	if (worktreeNum === 1 && !branchName) return;
	const project = composeProjectName(worktreeNum);
	if (composeDown(project, ["-v"]) === 0) {
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
			if (composeDown(p.Name, ["-v"]) === 0) {
				log(`removed compose stack ${p.Name}`);
			} else {
				console.error(`[dw] failed to remove compose stack ${p.Name}`);
			}
		}
	} catch {
		/* JSON parse failed, ignore */
	}
}

export function listAutumnComposeProjects(): string[] {
	if (!dockerComposeAvailable()) return [];
	const ls = sh("docker", ["compose", "ls", "--all", "--format", "json"]);
	if (ls.code !== 0 || !ls.stdout) return [];
	try {
		return (JSON.parse(ls.stdout) as { Name: string }[])
			.map((project) => project.Name)
			.filter((name) => /^autumn-wt-\d+$/.test(name));
	} catch {
		return [];
	}
}

export function removeComposeProject(project: string): boolean {
	if (!/^autumn-wt-\d+$/.test(project)) return false;
	if (composeDown(project, ["--remove-orphans"]) === 0) {
		log(`removed inactive compose stack ${project}`);
		return true;
	}
	console.error(`[dw] failed to remove compose stack ${project}`);
	return false;
}

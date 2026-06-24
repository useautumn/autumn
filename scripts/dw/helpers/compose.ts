import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "../constants.ts";
import { getCanonicalWorktree } from "./git.ts";
import {
	composeProjectName,
	dragonflyPortFor,
	elasticMqPortFor,
	ngrokApiPortFor,
	serverPortFor,
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

export function ensureComposeStack(
	worktreeNum: number,
	ngrokDomainArg?: string,
): { ngrokEnabled: boolean } {
	if (worktreeNum === 1) return { ngrokEnabled: false };
	if (!dockerComposeAvailable()) {
		log("docker compose not available; skipping infra stack");
		return { ngrokEnabled: false };
	}

	const project = composeProjectName(worktreeNum);
	const dragonflyPort = String(dragonflyPortFor(worktreeNum));
	const elasticMqPort = String(elasticMqPortFor(worktreeNum));
	const serverPort = String(serverPortFor(worktreeNum));
	const ngrokApiPort = String(ngrokApiPortFor(worktreeNum));
	// No authtoken => no public tunnel for this worktree (CMA stays unreachable,
	// but local dev still works). Gate the ngrok service on it.
	const ngrokEnabled = Boolean(process.env.NGROK_AUTHTOKEN);
	// A reserved domain gives a stable URL (Slack/CMA never need re-pointing, and
	// the eval's random tunnel can't steal it). dw passes the per-worktree domain it
	// reserved via the API; NGROK_DOMAIN env is a manual override. Bare host or URL.
	const ngrokDomain = (ngrokDomainArg ?? process.env.NGROK_DOMAIN)
		?.replace(/^https?:\/\//, "")
		.replace(/\/.*$/, "")
		.trim();
	const ngrokUrlFlag = ngrokDomain ? `--url=https://${ngrokDomain}` : "";

	const env = {
		...(process.env as Record<string, string>),
		COMPOSE_PROJECT_NAME: project,
		DRAGONFLY_PORT: dragonflyPort,
		ELASTICMQ_PORT: elasticMqPort,
		SERVER_PORT: serverPort,
		NGROK_API_PORT: ngrokApiPort,
		NGROK_URL_FLAG: ngrokUrlFlag,
	};

	const args = ["compose", "-f", composeFilePath, "-p", project];
	if (ngrokEnabled) args.push("--profile", "ngrok");
	args.push("up", "-d");

	const up = sh("docker", args, { env });
	if (up.code === 0) {
		log(
			`compose stack ${project} up (dragonfly :${dragonflyPort}, elasticmq :${elasticMqPort}${
				ngrokEnabled
					? `, ngrok -> :${serverPort} (api :${ngrokApiPort}${ngrokDomain ? `, domain ${ngrokDomain}` : ", random"})`
					: ""
			})`,
		);
	} else {
		console.error(
			`[dw] failed to start compose stack ${project}: ${up.stderr}`,
		);
	}
	return { ngrokEnabled };
}

// Read the random public URL ngrok assigned, from the container's local API.
// Polls because the tunnel takes a moment to connect after `up -d`. Returns
// undefined (rather than throwing) so a tunnel hiccup never blocks dev startup.
export async function readNgrokTunnelUrl(
	worktreeNum: number,
): Promise<string | undefined> {
	const apiPort = ngrokApiPortFor(worktreeNum);
	const maxAttempts = 60;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			const response = await fetch(`http://127.0.0.1:${apiPort}/api/tunnels`);
			const data = (await response.json()) as {
				tunnels?: Array<{ public_url?: string; proto?: string }>;
			};
			const tunnel = data.tunnels?.find(
				(candidate) => candidate.proto === "https" && candidate.public_url,
			);
			if (tunnel?.public_url) {
				const url = tunnel.public_url.replace(/\/$/, "");
				log(`ngrok tunnel up: ${url} -> :${serverPortFor(worktreeNum)}`);
				return url;
			}
		} catch {
			// ngrok's local API is not ready yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	log(
		`ngrok tunnel did not expose a public URL on :${apiPort} within 30s; continuing without NGROK_URL`,
	);
	return undefined;
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

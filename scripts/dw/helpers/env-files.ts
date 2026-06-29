import {
	existsSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
	ENV_LOCAL_DISABLED_SUFFIX,
	ENV_LOCAL_TARGETS,
	PROJECT_ROOT,
} from "../constants.ts";
import type { RegistryEntry } from "../types.ts";
import { isProvisioned } from "./entry.ts";
import {
	aliasesFor,
	dragonflyPortFor,
	elasticMqPortFor,
	portlessHttpsUrl,
	serverPortFor,
} from "./ports.ts";
import { log } from "./shell.ts";
import { forceSslVerifyFull } from "./url.ts";

// Simple KEY=VALUE parse (no quoting/multiline). Sufficient for .env.local
// files we own end-to-end; preserves blank lines and comments untouched.
export function parseEnvFile(contents: string): {
	keys: string[];
	values: Record<string, string>;
	raw: string[];
} {
	const raw = contents.split(/\r?\n/);
	const values: Record<string, string> = {};
	const keys: string[] = [];
	for (const line of raw) {
		const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!m) continue;
		const [, k, v] = m;
		values[k] = v;
		keys.push(k);
	}
	return { keys, values, raw };
}

export function mergeEnvFile(
	existing: string | null,
	managed: Record<string, string>,
): string {
	if (!existing) {
		return `${Object.entries(managed)
			.map(([k, v]) => `${k}=${v}`)
			.join("\n")}\n`;
	}
	const parsed = parseEnvFile(existing);
	const managedKeys = new Set(Object.keys(managed));
	const outLines: string[] = [];
	const seen = new Set<string>();
	for (const line of parsed.raw) {
		const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
		if (m && managedKeys.has(m[1])) {
			outLines.push(`${m[1]}=${managed[m[1]]}`);
			seen.add(m[1]);
		} else {
			outLines.push(line);
		}
	}
	for (const [k, v] of Object.entries(managed)) {
		if (!seen.has(k)) outLines.push(`${k}=${v}`);
	}
	// Strip trailing empty lines, then re-add a single newline.
	while (outLines.length > 0 && outLines[outLines.length - 1] === "") {
		outLines.pop();
	}
	return `${outLines.join("\n")}\n`;
}

function urlsForEntry(entry: RegistryEntry): { apiUrl: string; viteUrl: string } {
	if (isProvisioned(entry)) {
		const aliases = aliasesFor(entry.worktreeNum);
		return { apiUrl: aliases.apiUrl, viteUrl: aliases.viteUrl };
	}
	const serverPort = serverPortFor(entry.worktreeNum);
	const vitePort = 3000 + (entry.worktreeNum - 1) * 100;
	return {
		apiUrl: `http://localhost:${serverPort}`,
		viteUrl: `http://localhost:${vitePort}`,
	};
}

export function writeEnvLocalFiles(entry: RegistryEntry): void {
	const { worktreeNum, databaseUrl } = entry;
	if (!databaseUrl) {
		log("writeEnvLocalFiles: entry missing databaseUrl, skipping");
		return;
	}
	const { apiUrl, viteUrl } = urlsForEntry(entry);
	const serverPort = serverPortFor(worktreeNum);
	const portlessCa = join(homedir(), ".portless", "ca.pem");

	const dbUrl = forceSslVerifyFull(databaseUrl);
	const serverEnv: Record<string, string> = {
		DATABASE_URL: dbUrl,
		DATABASE_CRITICAL_URL: dbUrl,
		BETTER_AUTH_URL: apiUrl,
		CLIENT_URL: viteUrl,
		EMULATE_GOOGLE_URL: portlessHttpsUrl("google.emulate.localhost"),
		AUTUMN_TEST_BASE_URL: `http://localhost:${serverPort}`,
		AUTUMN_TEST_VITE_URL: viteUrl,
		STRIPE_WEBHOOK_SKIP_VERIFY: "true",
	};
	if (isProvisioned(entry)) {
		const dragonflyPort = dragonflyPortFor(worktreeNum);
		const elasticMqPort = elasticMqPortFor(worktreeNum);
		const redisUrl = `redis://localhost:${dragonflyPort}`;
		serverEnv.REDIS_URL = redisUrl;
		serverEnv.CACHE_URL = redisUrl;
		serverEnv.CACHE_V2_DRAGONFLY_URL = redisUrl;
		serverEnv.SQS_QUEUE_URL_V2 = `http://localhost:${elasticMqPort}/000000000000/autumn.fifo`;
		serverEnv.TRACK_SQS_QUEUE_URL = `http://localhost:${elasticMqPort}/000000000000/autumn-track.fifo`;
	}
	if (existsSync(portlessCa)) {
		serverEnv.NODE_EXTRA_CA_CERTS = portlessCa;
	}
	// Public tunnel for this worktree (CMA reaches /mcp through it). dev.ts derives
	// MCP_SERVER_URL/CHAT_URL/SLACK_BOT_URL from NGROK_URL; we also write it here so
	// it's visible to a standalone `cd server && bun dev` and documents the tunnel.
	if (entry.ngrokUrl) {
		serverEnv.NGROK_URL = entry.ngrokUrl;
	}

	const viteEnv: Record<string, string> = {
		VITE_BACKEND_URL: apiUrl,
		VITE_FRONTEND_URL: viteUrl,
	};

	const checkoutEnv: Record<string, string> = {
		VITE_BACKEND_URL: apiUrl,
	};

	const writeOne = (relPath: string, managed: Record<string, string>) => {
		const abs = join(PROJECT_ROOT, relPath);
		const dir = dirname(abs);
		if (!existsSync(dir)) {
			log(`writeEnvLocalFiles: skipping ${relPath} (dir ${dir} missing)`);
			return;
		}
		const existing = existsSync(abs) ? readFileSync(abs, "utf-8") : null;
		const merged = mergeEnvFile(existing, managed);
		writeFileSync(abs, merged);
	};

	writeOne("server/.env.local", serverEnv);
	writeOne("vite/.env.local", viteEnv);
	writeOne("apps/checkout/.env.local", checkoutEnv);
	log(`wrote .env.local for ${ENV_LOCAL_TARGETS.length} workspace(s)`);
}

export function removeEnvLocalFiles(): void {
	for (const rel of ENV_LOCAL_TARGETS) {
		const abs = join(PROJECT_ROOT, rel);
		if (existsSync(abs)) {
			rmSync(abs, { force: true });
			log(`removed ${rel}`);
		}
		const disabled = `${abs}${ENV_LOCAL_DISABLED_SUFFIX}`;
		if (existsSync(disabled)) {
			rmSync(disabled, { force: true });
			log(`removed ${rel}${ENV_LOCAL_DISABLED_SUFFIX}`);
		}
	}
}

export function disableEnvLocalFiles(): {
	moved: number;
	missing: number;
	alreadyDisabled: number;
} {
	let moved = 0;
	let missing = 0;
	let alreadyDisabled = 0;
	for (const rel of ENV_LOCAL_TARGETS) {
		const abs = join(PROJECT_ROOT, rel);
		const disabled = `${abs}${ENV_LOCAL_DISABLED_SUFFIX}`;
		if (existsSync(abs)) {
			if (existsSync(disabled)) rmSync(disabled, { force: true });
			renameSync(abs, disabled);
			log(`disabled ${rel} -> ${rel}${ENV_LOCAL_DISABLED_SUFFIX}`);
			moved++;
		} else if (existsSync(disabled)) {
			alreadyDisabled++;
		} else {
			missing++;
		}
	}
	return { moved, missing, alreadyDisabled };
}

export function enableEnvLocalFiles(): {
	moved: number;
	missing: number;
	alreadyEnabled: number;
} {
	let moved = 0;
	let missing = 0;
	let alreadyEnabled = 0;
	for (const rel of ENV_LOCAL_TARGETS) {
		const abs = join(PROJECT_ROOT, rel);
		const disabled = `${abs}${ENV_LOCAL_DISABLED_SUFFIX}`;
		if (existsSync(disabled)) {
			if (existsSync(abs)) rmSync(abs, { force: true });
			renameSync(disabled, abs);
			log(`enabled ${rel}`);
			moved++;
		} else if (existsSync(abs)) {
			alreadyEnabled++;
		} else {
			missing++;
		}
	}
	return { moved, missing, alreadyEnabled };
}

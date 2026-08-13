// scripts/capy/provision.ts
//
// One-shot provisioning for a Capy v2 VM. Sister to scripts/dw (which
// uses Docker + portless on a developer laptop) and scripts/tw (which
// targets the Vercel µVM with snapshot fork).
//
// What this does, in order:
//   1. Verify NEON_API_KEY is set (neon CLI auth — see
//      https://neon.com/docs/cli/auth — falls back to OAuth browser flow
//      otherwise, which isn't possible inside a Capy sandbox).
//   2. Verify the Docker Compose services started by capy-startup.sh.
//   3. Provision (or resume) a Neon branch named capy-<shortHash(machineId)>
//      off the shared `dw-template` branch. Reuses scripts/dw/helpers/neon.ts
//      so the dw and capy stacks branch out of the same template.
//   4. Apply pending committed migrations and refresh SQL functions.
//   5. Write server/.env.local, vite/.env.local, apps/checkout/.env.local
//      with the per-machine DATABASE_URL + localhost service URLs.
//
// Run via `bun scripts/capy/provision.ts`. Idempotent: a second run is a
// no-op for the Neon branch and refreshes env files in place.
//
import { randomBytes } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
	applyCommittedMigrations,
	loadDbFunctions,
} from "../dw/helpers/migration.ts";
import {
	connectionString,
	createBranch,
	ensureChatDatabase,
	ensureTemplateBranch,
	findBranchByName,
} from "../dw/helpers/neon.ts";
import {
	type CapyState,
	deriveBranchName,
	stateForMachine,
} from "./identity.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const PROJECT_ROOT = join(SCRIPT_DIR, "..", "..");
const CAPY_PREFIX = process.env.CAPY_PREFIX ?? join(homedir(), ".autumn-capy");
const CAPY_STATE = join(CAPY_PREFIX, "state.json");

const NEON_TEMPLATE_BRANCH = "dw-template";

// Capy v2 discovers listening HTTP services automatically. Its desktop
// service moved off :8080, so Autumn can use its standard local ports again.
const SERVER_PORT = 8080;
const VITE_PORT = 3000;
const DRAGONFLY_PORT = 6379;
const ELASTICMQ_PORT = 9324;
const DYNAMODB_PORT = 8000;

// ---------------------------------------------------------------------------
// Tiny logging / shell helpers (we don't reuse dw's helpers because they tag
// every log line with `[dw]` and shell to neon by name, which is what we want
// here too, but the wrapper API is small).
// ---------------------------------------------------------------------------

function log(msg: string): void {
	console.log(`[capy] ${msg}`);
}

function fatal(msg: string): never {
	console.error(`[capy] ${msg}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Machine identity
// ---------------------------------------------------------------------------

function getMachineId(): string {
	const configPath = process.env.CAPY_MACHINE_CONFIG?.trim();
	if (!configPath) fatal("CAPY_MACHINE_CONFIG is not set");
	if (!existsSync(configPath)) {
		fatal(`Capy machine config does not exist at ${configPath}`);
	}
	try {
		const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
			bindingId?: string;
		};
		if (!config.bindingId?.trim()) {
			fatal(`Capy machine config at ${configPath} has no bindingId`);
		}
		return config.bindingId.trim();
	} catch (error) {
		fatal(`Could not read Capy machine config at ${configPath}: ${error}`);
	}
}

// ---------------------------------------------------------------------------
// State file — tracks branch id + creation timestamp so we don't recreate
// or re-migrate on every startup. Lives in $CAPY_PREFIX so it persists for
// the lifetime of the sandbox filesystem.
// ---------------------------------------------------------------------------

// URL-safe base64 random string. Same shape as scripts/setup/writeAgentEnv.ts
// (`genUrlSafeBase64`) — server/src/utils/initUtils.ts::checkEnvVars exits
// the process if BETTER_AUTH_SECRET / ENCRYPTION_IV / ENCRYPTION_PASSWORD
// are missing, so first-run provisioning must mint these.
function genUrlSafeBase64(bytes: number): string {
	return randomBytes(bytes)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function ensureSecrets(
	state: CapyState | null,
): NonNullable<CapyState["secrets"]> {
	if (state?.secrets) return state.secrets;
	log(
		"minting per-machine secrets (BETTER_AUTH_SECRET, ENCRYPTION_IV, ENCRYPTION_PASSWORD)",
	);
	return {
		betterAuthSecret: genUrlSafeBase64(64),
		encryptionIv: genUrlSafeBase64(16),
		encryptionPassword: genUrlSafeBase64(64),
	};
}

function loadState(): CapyState | null {
	if (!existsSync(CAPY_STATE)) return null;
	try {
		return JSON.parse(readFileSync(CAPY_STATE, "utf-8")) as CapyState;
	} catch {
		log(`state file at ${CAPY_STATE} unreadable, ignoring`);
		return null;
	}
}

function saveState(state: CapyState): void {
	mkdirSync(dirname(CAPY_STATE), { recursive: true });
	writeFileSync(CAPY_STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
	chmodSync(CAPY_STATE, 0o600);
}

// ---------------------------------------------------------------------------
// Service readiness. capy-startup.sh owns Docker Compose; this script waits
// for published ports before writing env files that point at them.
// ---------------------------------------------------------------------------

function isDragonflyUp(): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connect(DRAGONFLY_PORT, "127.0.0.1");
		let settled = false;
		const finish = (ready: boolean) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			resolve(ready);
		};
		socket.setTimeout(800);
		socket.once("connect", () => socket.write("*1\r\n$4\r\nPING\r\n"));
		socket.once("data", (data) => finish(data.toString().startsWith("+PONG")));
		socket.once("error", () => finish(false));
		socket.once("timeout", () => finish(false));
	});
}

async function waitForDragonfly(): Promise<void> {
	for (let i = 0; i < 60; i++) {
		if (await isDragonflyUp()) {
			log(`dragonfly ready on :${DRAGONFLY_PORT}`);
			return;
		}
		await Bun.sleep(250);
	}
	fatal(
		"dragonfly did not become ready within 15s; inspect `docker compose logs`",
	);
}

async function isHttpServiceUp(port: number): Promise<boolean> {
	try {
		const res = await fetch(`http://localhost:${port}/`, {
			signal: AbortSignal.timeout(800),
		});
		return res.status > 0;
	} catch {
		return false;
	}
}

async function waitForHttpService(name: string, port: number): Promise<void> {
	for (let i = 0; i < 60; i++) {
		if (await isHttpServiceUp(port)) {
			log(`${name} ready on :${port}`);
			return;
		}
		await Bun.sleep(250);
	}
	fatal(
		`${name} did not become ready within 15s; inspect \`docker compose logs\``,
	);
}

// ---------------------------------------------------------------------------
// Env file writer — localhost equivalent of
// scripts/dw/helpers/env-files.ts::writeEnvLocalFiles. Capy v2's desktop and
// browser run inside the VM, and listening services are discovered
// automatically. preload-env.ts loads these into every bun invocation.
// ---------------------------------------------------------------------------

function forceSslVerifyFull(url: string): string {
	try {
		const u = new URL(url);
		u.searchParams.set("sslmode", "verify-full");
		return u.toString();
	} catch {
		return url;
	}
}

function parseEnvFile(contents: string): { raw: string[] } {
	return { raw: contents.split(/\r?\n/) };
}

function mergeEnvFile(
	existing: string | null,
	managed: Record<string, string>,
): string {
	if (!existing) {
		return `${Object.entries(managed)
			.map(([k, v]) => `${k}=${v}`)
			.join("\n")}\n`;
	}
	const { raw } = parseEnvFile(existing);
	const managedKeys = new Set(Object.keys(managed));
	const outLines: string[] = [];
	const seen = new Set<string>();
	for (const line of raw) {
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
	while (outLines.length > 0 && outLines[outLines.length - 1] === "") {
		outLines.pop();
	}
	return `${outLines.join("\n")}\n`;
}

function writeEnvFile(relPath: string, managed: Record<string, string>): void {
	const abs = join(PROJECT_ROOT, relPath);
	const dir = dirname(abs);
	if (!existsSync(dir)) {
		log(`skipping ${relPath} (dir ${dir} missing)`);
		return;
	}
	const existing = existsSync(abs) ? readFileSync(abs, "utf-8") : null;
	writeFileSync(abs, mergeEnvFile(existing, managed));
}

function writeEnvFiles(
	databaseUrl: string,
	secrets: NonNullable<CapyState["secrets"]>,
): void {
	const serverUrl = `http://localhost:${SERVER_PORT}`;
	const viteUrl = `http://localhost:${VITE_PORT}`;

	const dbUrl = forceSslVerifyFull(databaseUrl);
	const redisUrl = `redis://localhost:${DRAGONFLY_PORT}`;
	const sqsBase = `http://localhost:${ELASTICMQ_PORT}/000000000000`;

	const serverEnv: Record<string, string> = {
		SERVER_PORT: String(SERVER_PORT),
		// server/src/utils/initUtils.ts::checkEnvVars exits if any of these are
		// missing; legacy writeAgentEnv.ts handled the same set. Re-minted only
		// on first run — the values live in $CAPY_PREFIX/state.json.
		BETTER_AUTH_SECRET: secrets.betterAuthSecret,
		ENCRYPTION_IV: secrets.encryptionIv,
		ENCRYPTION_PASSWORD: secrets.encryptionPassword,
		DATABASE_URL: dbUrl,
		DATABASE_CRITICAL_URL: dbUrl,
		// Dragonfly serves the redis-protocol clients for every cache slot
		// (misc + v2). Matches dw env-files.ts.
		REDIS_URL: redisUrl,
		MISC_CACHE_DRAGONFLY_PUBLIC_URL: redisUrl,
		CACHE_V2_DRAGONFLY_URL: redisUrl,
		DYNAMODB_ENDPOINT: `http://localhost:${DYNAMODB_PORT}`,
		SQS_QUEUE_URL: `${sqsBase}/autumn.fifo`,
		SQS_QUEUE_URL_V2: `${sqsBase}/autumn.fifo`,
		TRACK_SQS_QUEUE_URL: `${sqsBase}/autumn-track.fifo`,
		TRACK_ASYNC_SQS_QUEUE_URL: `${sqsBase}/autumn-track.fifo`,
		TRACK_ASYNC_STANDARD_SQS_QUEUE_URL: `${sqsBase}/autumn-track-async`,
		STRIPE_WEBHOOK_SQS_QUEUE_URL: `${sqsBase}/autumn-stripe-webhook.fifo`,
		AWS_REGION: "us-east-1",
		AWS_ACCESS_KEY_ID: "x",
		AWS_SECRET_ACCESS_KEY: "x",
		AUTUMN_API_URL: serverUrl,
		AUTUMN_PUBLIC_API_URL: serverUrl,
		CLIENT_URL: viteUrl,
		STRIPE_WEBHOOK_SKIP_VERIFY: "true",
		// Login flow that works without external services: dev `sendOTPEmail`
		// prints the OTP to the server log. The README documents this path.
		NODE_ENV: "development",
	};

	const viteEnv: Record<string, string> = {
		VITE_BACKEND_URL: serverUrl,
		VITE_FRONTEND_URL: viteUrl,
	};

	const checkoutEnv: Record<string, string> = {
		VITE_BACKEND_URL: serverUrl,
		VITE_API_URL: serverUrl,
	};

	writeEnvFile("server/.env.local", serverEnv);
	writeEnvFile("vite/.env.local", viteEnv);
	writeEnvFile("apps/checkout/.env.local", checkoutEnv);
	log(`wrote .env.local for server/, vite/, apps/checkout/`);
	log(`  server: ${serverUrl}`);
	log(`  vite:   ${viteUrl}`);
}

// ---------------------------------------------------------------------------
// Neon branch provisioning. First run: create branch off dw-template, run
// migrations, load functions. Subsequent runs: read connection string,
// no DDL. Matches scripts/dw/helpers/setup.ts::setupAgentWorktree behavior.
// ---------------------------------------------------------------------------

function ensureNeonAuth(): void {
	if (!process.env.NEON_API_KEY) {
		fatal(
			[
				"NEON_API_KEY is not set.",
				"",
				"The dw/capy stack provisions a Neon branch per machine. Add a Neon",
				"personal API key (https://console.neon.tech → Account settings → API",
				"keys) to Settings → Project → Environment variables as NEON_API_KEY.",
				"The Neon CLI",
				"reads it automatically (see https://neon.com/docs/cli/auth).",
			].join("\n"),
		);
	}
}

function ensureNeonBranch(
	machineId: string,
	state: CapyState | null,
): CapyState {
	const branchName = deriveBranchName(machineId);

	// Branch already provisioned in state file and still exists on Neon →
	// just refresh the connection string and return.
	if (state?.branchName === branchName && state.branchId) {
		const existing = findBranchByName(branchName);
		if (existing) {
			log(`reusing existing Neon branch ${branchName} (${state.branchId})`);
			const pooledUrl = connectionString(existing.id, { pooled: true });
			return { ...state, branchId: existing.id, databaseUrl: pooledUrl };
		}
		log(
			`state references ${branchName} but Neon no longer has it — reprovisioning`,
		);
	}

	// State-less, or branch was deleted upstream — check if it exists by name
	// before creating (handles a stale state file after a sandbox snapshot).
	const existingByName = findBranchByName(branchName);
	if (existingByName) {
		log(`adopting existing Neon branch ${branchName} (${existingByName.id})`);
		const pooledUrl = connectionString(existingByName.id, { pooled: true });
		return {
			machineId,
			branchName,
			branchId: existingByName.id,
			databaseUrl: pooledUrl,
			createdAt: state?.createdAt ?? Date.now(),
		};
	}

	// True first run.
	log(
		`first run for ${branchName} — provisioning Neon branch off ${NEON_TEMPLATE_BRANCH}`,
	);
	ensureTemplateBranch();
	const branch = createBranch(branchName, NEON_TEMPLATE_BRANCH);
	const pooledUrl = connectionString(branch.id, { pooled: true });
	return {
		machineId,
		branchName,
		branchId: branch.id,
		databaseUrl: pooledUrl,
		createdAt: Date.now(),
	};
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	if (process.env.NODE_ENV === "production") {
		fatal("capy provision is disabled when NODE_ENV=production");
	}

	const machineId = getMachineId();
	log(`branch=${deriveBranchName(machineId)}`);

	// 1. Local services were started by capy-startup.sh. Wait for their
	// published ports before provisioning anything that writes their URLs.
	await waitForDragonfly();
	await Promise.all([
		waitForHttpService("elasticmq", ELASTICMQ_PORT),
		waitForHttpService("dynamodb", DYNAMODB_PORT),
	]);

	// 2. Neon auth + branch + migrations.
	ensureNeonAuth();
	const storedState = loadState();
	const priorState = stateForMachine(storedState, machineId);
	if (storedState && !priorState) {
		log("discarding state copied from a different Capy VM");
	}
	const nextState = ensureNeonBranch(machineId, priorState);
	if (!nextState.branchName) fatal("provisioning produced no branchName");
	if (!nextState.branchId) fatal("provisioning produced no branchId");
	const directUrl = connectionString(nextState.branchId, { pooled: false });
	applyCommittedMigrations(nextState.branchName, directUrl);
	loadDbFunctions(nextState.branchName, directUrl);

	// Per-machine secrets — mint on first run, then persist. Server can't
	// boot without BETTER_AUTH_SECRET / ENCRYPTION_IV / ENCRYPTION_PASSWORD.
	nextState.secrets = ensureSecrets(priorState);

	saveState(nextState);
	if (!nextState.databaseUrl) fatal("provisioning produced no databaseUrl");

	// Leaf's chat-sdk wants a separate `chat` DB on the same branch (env.ts
	// rewrites /neondb -> /chat). dw calls this on every setup (not just on
	// branch creation) so a transient Neon hiccup gets retried next time;
	// match that behavior here. Non-fatal — the helper logs and continues.
	if (nextState.branchName) ensureChatDatabase(nextState.branchName);

	// 3. Env files. preload-env.ts at every bun entry point auto-loads these.
	writeEnvFiles(nextState.databaseUrl, nextState.secrets);

	log("capy provision complete — run `bun dev` to start the stack");
}

await main();

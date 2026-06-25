// scripts/capy/provision.ts
//
// One-shot provisioning for a Capy sandbox. Sister to scripts/dw (which
// uses Docker + portless on a developer laptop) and scripts/tw (which
// targets the Vercel µVM with snapshot fork).
//
// What this does, in order:
//   1. Verify NEON_API_KEY is set (neon CLI auth — see
//      https://neon.com/docs/cli/auth — falls back to OAuth browser flow
//      otherwise, which isn't possible inside a Capy sandbox).
//   2. Start Dragonfly + goaws as nohup background processes on the
//      ports server/.env.local expects (6379, 9324). Idempotent.
//   3. Provision (or resume) a Neon branch named capy-<shortHash(sandboxId)>
//      off the shared `dw-template` branch. Reuses scripts/dw/helpers/neon.ts
//      so the dw and capy stacks branch out of the same template.
//   4. Apply committed migrations + load SQL functions on first run only;
//      a previously-provisioned branch is reused as-is.
//   5. Write server/.env.local, vite/.env.local, apps/checkout/.env.local
//      with the per-sandbox DATABASE_URL + Daytona preview URLs.
//
// Run via `bun scripts/capy/provision.ts`. Idempotent: a second run is a
// no-op for the Neon branch and refreshes env files in place.
//
// Daytona preview URLs follow the pattern documented at
// https://www.daytona.io/docs/en/preview/ :
//   https://{port}-{DAYTONA_SANDBOX_ID}.proxy.daytona.work
// Sandboxes are private by default so the browser sees a 307 to Auth0 once,
// then carries the Daytona session cookie. From inside the sandbox the
// preview URL is unreachable (no Daytona auth on server-to-self), so all
// server-internal traffic uses localhost.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
	connectionString,
	createBranch,
	ensureChatDatabase,
	ensureTemplateBranch,
	findBranchByName,
} from "../dw/helpers/neon.ts";
import {
	applyCommittedMigrations,
	loadDbFunctions,
} from "../dw/helpers/migration.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const PROJECT_ROOT = join(SCRIPT_DIR, "..", "..");
const CAPY_PREFIX = process.env.CAPY_PREFIX ?? join(homedir(), ".autumn-capy");
const CAPY_STATE = join(CAPY_PREFIX, "state.json");
const LOG_DIR = join(CAPY_PREFIX, "logs");
const BIN_DIR = join(CAPY_PREFIX, "bin");
const GOAWS_CONF = join(CAPY_PREFIX, "goaws", "goaws.yaml");
const DRAGONFLY_DIR = join(CAPY_PREFIX, "dragonfly");

const NEON_TEMPLATE_BRANCH = "dw-template";

// Browser-facing ports — these are surfaced as Daytona preview URLs in the
// env files. Internal-only ports (checkout :3001, leaf/chat :3099) don't
// need to leak into env vars — `dev.ts` already hardcodes their localhost
// URLs for sibling processes.
const SERVER_PORT = 8080;
const VITE_PORT = 3000;
const DRAGONFLY_PORT = 6379;
const ELASTICMQ_PORT = 9324;

// Daytona's public proxy domain — verified live in this sandbox by curl'ing
// https://{port}-{sandboxId}.proxy.daytona.work and observing a 307 to
// daytonaio.us.auth0.com/authorize (sandbox is private; the browser session
// cookie unlocks it). The `app.daytona.io` proxy variant returns 000 from
// inside the sandbox, so we use proxy.daytona.work only.
const DAYTONA_PROXY_DOMAIN =
	process.env.DAYTONA_PROXY_DOMAIN ?? "proxy.daytona.work";

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

function sh(
	cmd: string,
	args: string[],
	opts: { env?: Record<string, string>; cwd?: string } = {},
): { stdout: string; stderr: string; code: number } {
	const proc = Bun.spawnSync([cmd, ...args], {
		cwd: opts.cwd,
		env: opts.env ?? (process.env as Record<string, string>),
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		stdout: new TextDecoder().decode(proc.stdout).trim(),
		stderr: new TextDecoder().decode(proc.stderr).trim(),
		code: proc.exitCode ?? 1,
	};
}

// ---------------------------------------------------------------------------
// Sandbox identity
// ---------------------------------------------------------------------------

function shortHash(input: string): string {
	return createHash("sha1").update(input).digest("hex").slice(0, 7);
}

function getSandboxId(): string {
	const id = process.env.DAYTONA_SANDBOX_ID?.trim();
	if (id) return id;
	// Outside Capy/Daytona (e.g. local repro) fall back to hostname so the
	// branch name is still stable per-host. Not a load-bearing path.
	const host =
		process.env.HOSTNAME ?? (sh("hostname", []).stdout || "unknown");
	return host.trim();
}

function deriveBranchName(sandboxId: string): string {
	return `capy-${shortHash(sandboxId)}`;
}

function daytonaPreviewUrl(port: number, sandboxId: string): string {
	return `https://${port}-${sandboxId}.${DAYTONA_PROXY_DOMAIN}`;
}

// ---------------------------------------------------------------------------
// State file — tracks branch id + creation timestamp so we don't recreate
// or re-migrate on every startup. Lives in $CAPY_PREFIX so it persists for
// the lifetime of the sandbox filesystem.
// ---------------------------------------------------------------------------

type State = {
	sandboxId: string;
	branchName?: string;
	branchId?: string;
	databaseUrl?: string;
	createdAt: number;
	// Per-sandbox secrets — generated once on first run, persisted, then
	// re-used so a server restart doesn't invalidate every session.
	// scripts/setup/writeAgentEnv.ts does the same for the legacy bootstrap;
	// the dw flow inherits these from infisical instead.
	secrets?: {
		betterAuthSecret: string;
		encryptionIv: string;
		encryptionPassword: string;
	};
};

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

function ensureSecrets(state: State | null): State["secrets"] {
	if (state?.secrets) return state.secrets;
	log("minting per-sandbox secrets (BETTER_AUTH_SECRET, ENCRYPTION_IV, ENCRYPTION_PASSWORD)");
	return {
		betterAuthSecret: genUrlSafeBase64(64),
		encryptionIv: genUrlSafeBase64(16),
		encryptionPassword: genUrlSafeBase64(64),
	};
}

function loadState(): State | null {
	if (!existsSync(CAPY_STATE)) return null;
	try {
		return JSON.parse(readFileSync(CAPY_STATE, "utf-8")) as State;
	} catch {
		log(`state file at ${CAPY_STATE} unreadable, ignoring`);
		return null;
	}
}

function saveState(state: State): void {
	mkdirSync(dirname(CAPY_STATE), { recursive: true });
	writeFileSync(CAPY_STATE, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// Service supervisors. We nohup dragonfly + goaws into background processes
// the first time, then PING/HTTP-probe to confirm. No process supervisor
// because Capy's supervisord owns the VM lifecycle; if the sandbox restarts
// the startup hook re-runs us and we redaemon.
// ---------------------------------------------------------------------------

function isDragonflyUp(): boolean {
	const r = sh("redis-cli", ["-p", String(DRAGONFLY_PORT), "PING"]);
	return r.code === 0 && r.stdout === "PONG";
}

function startDragonfly(): void {
	if (isDragonflyUp()) {
		log("dragonfly already running");
		return;
	}
	const bin = join(BIN_DIR, "dragonfly");
	if (!existsSync(bin)) fatal(`dragonfly binary missing at ${bin}`);
	mkdirSync(LOG_DIR, { recursive: true });
	mkdirSync(DRAGONFLY_DIR, { recursive: true });
	log(`starting dragonfly on :${DRAGONFLY_PORT}`);
	// setsid + disown the process; bun's spawn keeps the parent alive until
	// the child exits, but a fresh fork+exec is what we want here.
	const proc = Bun.spawn(
		[
			bin,
			"--port",
			String(DRAGONFLY_PORT),
			"--bind",
			"127.0.0.1",
			"--dir",
			DRAGONFLY_DIR,
			"--dbfilename",
			"dump",
		],
		{
			stdout: Bun.file(join(LOG_DIR, "dragonfly.log")),
			stderr: Bun.file(join(LOG_DIR, "dragonfly.log")),
			stdin: "ignore",
		},
	);
	proc.unref();
	for (let i = 0; i < 60; i++) {
		if (isDragonflyUp()) {
			log(`dragonfly ready on :${DRAGONFLY_PORT}`);
			return;
		}
		Bun.sleepSync(250);
	}
	fatal(`dragonfly did not become ready within 15s; see ${LOG_DIR}/dragonfly.log`);
}

async function isGoawsUp(): Promise<boolean> {
	try {
		const res = await fetch(`http://localhost:${ELASTICMQ_PORT}/`, {
			signal: AbortSignal.timeout(800),
		});
		// `GET /` without Action returns 400 from goaws but means the server is
		// listening; any HTTP response counts as up.
		return res.status > 0;
	} catch {
		return false;
	}
}

async function startGoaws(): Promise<void> {
	if (await isGoawsUp()) {
		log("goaws already running");
		return;
	}
	const bin = join(BIN_DIR, "goaws");
	if (!existsSync(bin)) fatal(`goaws binary missing at ${bin}`);
	if (!existsSync(GOAWS_CONF)) fatal(`goaws config missing at ${GOAWS_CONF}`);
	mkdirSync(LOG_DIR, { recursive: true });
	log(`starting goaws on :${ELASTICMQ_PORT}`);
	const proc = Bun.spawn([bin, "-config", GOAWS_CONF], {
		stdout: Bun.file(join(LOG_DIR, "goaws.log")),
		stderr: Bun.file(join(LOG_DIR, "goaws.log")),
		stdin: "ignore",
	});
	proc.unref();
	for (let i = 0; i < 60; i++) {
		if (await isGoawsUp()) {
			log(`goaws ready on :${ELASTICMQ_PORT} (autumn.fifo + autumn-track.fifo)`);
			return;
		}
		await Bun.sleep(250);
	}
	fatal(`goaws did not become ready within 15s; see ${LOG_DIR}/goaws.log`);
}

// ---------------------------------------------------------------------------
// Env file writer — port-for-port equivalent of
// scripts/dw/helpers/env-files.ts::writeEnvLocalFiles, but with Daytona
// preview URLs instead of portless `wtN.localhost` aliases. preload-env.ts
// auto-loads these into every `bun` invocation, so `bun dev` picks them up
// without further plumbing.
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
	sandboxId: string,
	secrets: NonNullable<State["secrets"]>,
): void {
	const serverUrl = daytonaPreviewUrl(SERVER_PORT, sandboxId);
	const viteUrl = daytonaPreviewUrl(VITE_PORT, sandboxId);

	const dbUrl = forceSslVerifyFull(databaseUrl);
	const redisUrl = `redis://localhost:${DRAGONFLY_PORT}`;
	const sqsBase = `http://localhost:${ELASTICMQ_PORT}/000000000000`;

	const serverEnv: Record<string, string> = {
		// server/src/utils/initUtils.ts::checkEnvVars exits if any of these are
		// missing; legacy writeAgentEnv.ts handled the same set. Re-minted only
		// on first run — the values live in $CAPY_PREFIX/state.json.
		BETTER_AUTH_SECRET: secrets.betterAuthSecret,
		ENCRYPTION_IV: secrets.encryptionIv,
		ENCRYPTION_PASSWORD: secrets.encryptionPassword,
		DATABASE_URL: dbUrl,
		DATABASE_CRITICAL_URL: dbUrl,
		// Dragonfly serves the redis-protocol clients for ALL three cache slots
		// (CACHE_URL legacy, CACHE_URL_US_EAST regional, CACHE_V2_DRAGONFLY_URL
		// v2). Matches dw env-files.ts.
		REDIS_URL: redisUrl,
		CACHE_URL: redisUrl,
		CACHE_URL_US_EAST: redisUrl,
		CACHE_V2_DRAGONFLY_URL: redisUrl,
		// goaws speaks the SQS protocol; queue URLs match the names declared
		// in $CAPY_PREFIX/goaws/goaws.yaml.
		SQS_QUEUE_URL_V2: `${sqsBase}/autumn.fifo`,
		TRACK_SQS_QUEUE_URL: `${sqsBase}/autumn-track.fifo`,
		AWS_REGION: "us-east-1",
		AWS_ACCESS_KEY_ID: "x",
		AWS_SECRET_ACCESS_KEY: "x",
		// Daytona preview URLs — browser-facing. The server uses these to build
		// OAuth callbacks (better-auth) and CORS allow lists. Internal calls go
		// to http://localhost:PORT (set in dev.ts).
		BETTER_AUTH_URL: serverUrl,
		CLIENT_URL: viteUrl,
		STRIPE_WEBHOOK_URL: serverUrl,
		// Webhook signature verification needs the original Stripe-signed URL;
		// the Capy proxy rewrites Host, so always skip-verify here. dw does the
		// same.
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
		// apps/checkout reads VITE_API_URL directly (not VITE_BACKEND_URL) in
		// checkoutClient.ts and LongLivedCheckoutPage.tsx — without it the
		// browser falls back to http://localhost:8080, which from the user's
		// laptop hits THEIR machine, not this sandbox.
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
				"The dw/capy stack provisions a Neon branch per sandbox. Add a Neon",
				"personal API key (https://console.neon.tech → Account settings → API",
				"keys) to the Capy project environment as NEON_API_KEY. The Neon CLI",
				"reads it automatically (see https://neon.com/docs/cli/auth).",
			].join("\n"),
		);
	}
}

function ensureNeonBranch(sandboxId: string, state: State | null): State {
	const branchName = deriveBranchName(sandboxId);

	// Branch already provisioned in state file and still exists on Neon →
	// just refresh the connection string and return.
	if (state?.branchName === branchName && state.branchId) {
		const existing = findBranchByName(branchName);
		if (existing) {
			log(`reusing existing Neon branch ${branchName} (${state.branchId})`);
			const pooledUrl = connectionString(branchName, { pooled: true });
			return { ...state, databaseUrl: pooledUrl };
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
		const pooledUrl = connectionString(branchName, { pooled: true });
		return {
			sandboxId,
			branchName,
			branchId: existingByName.id,
			databaseUrl: pooledUrl,
			createdAt: state?.createdAt ?? Date.now(),
		};
	}

	// True first run.
	log(`first run for ${branchName} — provisioning Neon branch off ${NEON_TEMPLATE_BRANCH}`);
	ensureTemplateBranch();
	const branch = createBranch(branchName, NEON_TEMPLATE_BRANCH);
	const directUrl = connectionString(branchName, { pooled: false });
	applyCommittedMigrations(branchName, directUrl);
	loadDbFunctions(branchName, directUrl);
	const pooledUrl = connectionString(branchName, { pooled: true });
	return {
		sandboxId,
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

	const sandboxId = getSandboxId();
	log(`sandbox=${sandboxId} branch=${deriveBranchName(sandboxId)}`);

	// 1. Native services first — they don't need credentials and they're
	// useful for db CLI ops below.
	startDragonfly();
	await startGoaws();

	// 2. Neon auth + branch + migrations.
	ensureNeonAuth();
	const priorState = loadState();
	const nextState = ensureNeonBranch(sandboxId, priorState);

	// Per-sandbox secrets — mint on first run, then persist. Server can't
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
	writeEnvFiles(nextState.databaseUrl, sandboxId, nextState.secrets);

	log("capy provision complete — run `bun dev` to start the stack");
}

await main();

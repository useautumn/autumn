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
import { createCipheriv, createHash, randomBytes } from "node:crypto";
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
import { ensureFakecloudQueues } from "../dw/helpers/fakecloud.ts";
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
	waitForNeonBranchOperations,
} from "../dw/helpers/neon.ts";
import { sh } from "../dw/helpers/shell.ts";
import {
	capyEnvFiles,
	DRAGONFLY_PORT,
	FAKECLOUD_PORT,
	KAFKA_PORT,
	TRIGGER_PORT,
} from "./serverEnv.ts";
import {
	findStaleBookmarks,
	type PartitionBookmark,
	parseLogEndOffsets,
} from "./staleKafkaBookmarks.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const PROJECT_ROOT = join(SCRIPT_DIR, "..", "..");
const CAPY_PREFIX = process.env.CAPY_PREFIX ?? join(homedir(), ".autumn-capy");
const CAPY_STATE = join(CAPY_PREFIX, "state.json");

const NEON_TEMPLATE_BRANCH = "dw-template";

const TRIGGER_PROJECT_REF = "proj_cwiutfmpdzfcshxevkok";
const TRIGGER_IMAGE_TAG = `v${
	(
		JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf-8")) as {
			devDependencies: Record<string, string>;
		}
	).devDependencies["trigger.dev"]
}`;

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

function shortHash(input: string): string {
	return createHash("sha1").update(input).digest("hex").slice(0, 7);
}

function getMachineId(): string {
	// Hostnames repeat across VMs cloned from one image, so identity is a
	// minted id persisted for the lifetime of this machine's filesystem.
	const idPath = join(CAPY_PREFIX, "machine-id");
	if (existsSync(idPath)) {
		const existing = readFileSync(idPath, "utf-8").trim();
		if (existing) return existing;
	}
	const minted = `capy-${randomBytes(8).toString("hex")}`;
	mkdirSync(CAPY_PREFIX, { recursive: true });
	writeFileSync(idPath, `${minted}\n`, { mode: 0o600 });
	return minted;
}

function deriveBranchName(machineId: string): string {
	return `capy-${shortHash(machineId)}`;
}

// ---------------------------------------------------------------------------
// State file — tracks branch id + creation timestamp so we don't recreate
// or re-migrate on every startup. Lives in $CAPY_PREFIX so it persists for
// the lifetime of the sandbox filesystem.
// ---------------------------------------------------------------------------

type State = {
	machineId: string;
	branchName?: string;
	branchId?: string;
	databaseUrl?: string;
	createdAt: number;
	// Per-machine secrets — generated once on first run, persisted, then
	// re-used so a server restart doesn't invalidate every session.
	// scripts/setup/writeAgentEnv.ts does the same for the legacy bootstrap;
	// the dw flow inherits these from infisical instead.
	secrets?: {
		betterAuthSecret: string;
		encryptionIv: string;
		encryptionPassword: string;
	};
};

const triggerEnvironmentSql = ({
	apiKey,
	id,
	memberId,
	pkApiKey,
	shortcode,
	slug,
	type,
}: {
	apiKey: string;
	id: string;
	memberId?: string;
	pkApiKey: string;
	shortcode: string;
	slug: string;
	type: "DEVELOPMENT" | "PRODUCTION";
}) =>
	`INSERT INTO "RuntimeEnvironment" (id, slug, "apiKey", "pkApiKey", type, shortcode, "organizationId", "projectId", "orgMemberId", "updatedAt") VALUES ('${id}', '${slug}', '${apiKey}', '${pkApiKey}', '${type}', '${shortcode}', 'capy-org', 'capy-project', ${memberId ? `'${memberId}'` : "NULL"}, now()) ON CONFLICT (id) DO NOTHING;`;

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

function ensureSecrets(state: State | null): NonNullable<State["secrets"]> {
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

async function waitForHttpService(
	name: string,
	port: number,
	timeoutSeconds = 15,
): Promise<void> {
	const attempts = timeoutSeconds * 4;
	for (let i = 0; i < attempts; i++) {
		if (await isHttpServiceUp(port)) {
			log(`${name} ready on :${port}`);
			return;
		}
		await Bun.sleep(250);
	}
	fatal(
		`${name} did not become ready within ${timeoutSeconds}s; inspect \`docker compose logs\``,
	);
}

// ---------------------------------------------------------------------------
// Env file writer — localhost equivalent of
// scripts/dw/helpers/env-files.ts::writeEnvLocalFiles. Capy v2's desktop and
// browser run inside the VM, and listening services are discovered
// automatically. preload-env.ts loads these into every bun invocation.
// ---------------------------------------------------------------------------

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
	secrets: NonNullable<State["secrets"]>,
	triggerSecretKey: string,
	triggerAccessToken: string,
): void {
	const { server, vite, checkout } = capyEnvFiles({
		databaseUrl,
		secrets,
		triggerSecretKey,
		triggerAccessToken,
	});
	writeEnvFile("server/.env.local", server);
	writeEnvFile("vite/.env.local", vite);
	writeEnvFile("apps/checkout/.env.local", checkout);
	log(`wrote .env.local for server/, vite/, apps/checkout/`);
	log(`  server: ${server.AUTUMN_API_URL}`);
	log(`  vite:   ${server.CLIENT_URL}`);
}

function runSetupTest(args: string[], databaseUrl: string): void {
	log(`running setup-test ${args.join(" ")}`);
	const result = Bun.spawnSync(
		["bun", "scripts/setup/setup-test.ts", ...args],
		{
			cwd: PROJECT_ROOT,
			env: {
				...process.env,
				DATABASE_URL: databaseUrl,
				DATABASE_CRITICAL_URL: databaseUrl,
			},
			stdout: "inherit",
			stderr: "inherit",
		},
	);
	if (result.exitCode !== 0) {
		fatal(
			`setup-test ${args.join(" ")} exited with code ${result.exitCode ?? 1}`,
		);
	}
}

function triggerCompose(args: string[]) {
	const triggerEnv = join(CAPY_PREFIX, "trigger.env");
	const result = Bun.spawnSync(
		[
			"docker",
			"compose",
			"--env-file",
			triggerEnv,
			"-f",
			join(PROJECT_ROOT, "scripts/setup/trigger.compose.yml"),
			"-p",
			"autumn-capy-trigger",
			...args,
		],
		{
			cwd: PROJECT_ROOT,
			env: { ...process.env, TRIGGER_IMAGE_TAG },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	if (result.exitCode !== 0) {
		fatal(new TextDecoder().decode(result.stderr).trim());
	}
	return result;
}

function readTriggerAccessToken(): string | undefined {
	const contents = readFileSync(join(CAPY_PREFIX, "trigger.env"), "utf-8");
	return contents.match(/^TRIGGER_ACCESS_TOKEN=(tr_pat_[A-Za-z0-9]+)$/m)?.[1];
}

function readTriggerEnv(): Record<string, string> {
	return Object.fromEntries(
		readFileSync(join(CAPY_PREFIX, "trigger.env"), "utf-8")
			.split(/\r?\n/)
			.map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
			.filter((match): match is RegExpMatchArray => Boolean(match))
			.map((match) => [match[1], match[2]]),
	);
}

function saveTriggerAccessToken(token: string): void {
	const envPath = join(CAPY_PREFIX, "trigger.env");
	const contents = readFileSync(envPath, "utf-8").replace(
		/^TRIGGER_ACCESS_TOKEN=.*\n?/m,
		"",
	);
	writeFileSync(
		envPath,
		`${contents.trimEnd()}\nTRIGGER_ACCESS_TOKEN=${token}\n`,
		{
			mode: 0o600,
		},
	);
	chmodSync(envPath, 0o600);
}

function ensureTriggerProject(): {
	secretKey: string;
	accessToken: string;
} {
	const selectKey = `SELECT "apiKey" FROM "RuntimeEnvironment" WHERE "projectId" = (SELECT id FROM "Project" WHERE "externalRef" = '${TRIGGER_PROJECT_REF}') AND type = 'DEVELOPMENT' ORDER BY "createdAt" LIMIT 1;`;

	let result = triggerCompose([
		"exec",
		"-T",
		"postgres",
		"psql",
		"-U",
		"postgres",
		"-d",
		"main",
		"-Atc",
		selectKey,
	]);
	let key =
		new TextDecoder().decode(result.stdout).trim().split("\n").at(-1) ||
		undefined;
	let accessToken = readTriggerAccessToken();
	if (key?.startsWith("tr_dev_") && accessToken) {
		log("repairing Trigger.dev local user and Autumn project");
	} else {
		log("seeding Trigger.dev local user and Autumn project");
	}
	accessToken ??= `tr_pat_${randomBytes(20).toString("hex")}`;
	saveTriggerAccessToken(accessToken);
	key ??= `tr_dev_${randomBytes(12).toString("hex")}`;
	const prodKey = `tr_prod_${randomBytes(12).toString("hex")}`;
	const env = readTriggerEnv();
	const encryptionKey = env.TRIGGER_ENCRYPTION_KEY;
	if (encryptionKey?.length !== 32) {
		fatal("TRIGGER_ENCRYPTION_KEY must be exactly 32 bytes");
	}
	const nonce = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
	const ciphertext = Buffer.concat([
		cipher.update(accessToken, "utf8"),
		cipher.final(),
	]);
	const encryptedToken = JSON.stringify({
		nonce: nonce.toString("hex"),
		ciphertext: ciphertext.toString("hex"),
		tag: cipher.getAuthTag().toString("hex"),
	}).replaceAll("'", "''");
	const tokenHash = createHash("sha256").update(accessToken).digest("hex");
	const sql = [
		`INSERT INTO "User" (id, email, "authenticationMethod", admin, "confirmedBasicDetails", "updatedAt") VALUES ('capy-user', 'capy@local.invalid', 'MAGIC_LINK', true, true, now()) ON CONFLICT (id) DO NOTHING;`,
		`INSERT INTO "Organization" (id, slug, title, "v3Enabled", "updatedAt") VALUES ('capy-org', 'autumn-capy', 'Autumn Capy', true, now()) ON CONFLICT (id) DO NOTHING;`,
		`INSERT INTO "OrgMember" (id, "organizationId", "userId", role, "updatedAt") VALUES ('capy-member', 'capy-org', 'capy-user', 'ADMIN', now()) ON CONFLICT (id) DO NOTHING;`,
		`INSERT INTO "Project" (id, slug, name, "externalRef", "organizationId", version, engine, "updatedAt") VALUES ('capy-project', 'autumn-capy', 'Autumn', '${TRIGGER_PROJECT_REF}', 'capy-org', 'V3', 'V2', now()) ON CONFLICT (id) DO NOTHING;`,
		triggerEnvironmentSql({
			apiKey: key,
			id: "capy-dev-env",
			memberId: "capy-member",
			pkApiKey: `pk_${randomBytes(12).toString("hex")}`,
			shortcode: "capy-dev",
			slug: "dev",
			type: "DEVELOPMENT",
		}),
		triggerEnvironmentSql({
			apiKey: prodKey,
			id: "capy-prod-env",
			pkApiKey: `pk_${randomBytes(12).toString("hex")}`,
			shortcode: "capy-prod",
			slug: "prod",
			type: "PRODUCTION",
		}),
		`INSERT INTO "PersonalAccessToken" (id, name, "encryptedToken", "obfuscatedToken", "hashedToken", "userId", "updatedAt") VALUES ('capy-cli-token', 'capy-cli', '${encryptedToken}'::jsonb, 'tr_pat_local', '${tokenHash}', 'capy-user', now()) ON CONFLICT (id) DO UPDATE SET "encryptedToken" = EXCLUDED."encryptedToken", "hashedToken" = EXCLUDED."hashedToken", "revokedAt" = NULL, "updatedAt" = now();`,
		selectKey,
	].join(" ");
	result = triggerCompose([
		"exec",
		"-T",
		"postgres",
		"psql",
		"-U",
		"postgres",
		"-d",
		"main",
		"-Atc",
		sql,
	]);
	key = new TextDecoder().decode(result.stdout).trim().split("\n").at(-1);
	if (!key?.startsWith("tr_dev_")) {
		fatal("Trigger.dev seed did not create Autumn's development environment");
	}
	return { secretKey: key, accessToken };
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
	state: State | null,
): { state: State; created: boolean } {
	const branchName = deriveBranchName(machineId);

	// Branch already provisioned in state file and still exists on Neon →
	// just refresh the connection string and return.
	if (state?.branchName === branchName && state.branchId) {
		const existing = findBranchByName(branchName);
		if (existing) {
			log(`reusing existing Neon branch ${branchName} (${state.branchId})`);
			const pooledUrl = connectionString(branchName, { pooled: true });
			return {
				state: { ...state, databaseUrl: pooledUrl },
				created: false,
			};
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
			state: {
				machineId,
				branchName,
				branchId: existingByName.id,
				databaseUrl: pooledUrl,
				createdAt: state?.createdAt ?? Date.now(),
			},
			created: false,
		};
	}

	// True first run.
	log(
		`first run for ${branchName} — provisioning Neon branch off ${NEON_TEMPLATE_BRANCH}`,
	);
	ensureTemplateBranch();
	const branch = createBranch(branchName, NEON_TEMPLATE_BRANCH);
	waitForNeonBranchOperations(branch);
	const pooledUrl = connectionString(branchName, { pooled: true });
	return {
		state: {
			machineId,
			branchName,
			branchId: branch.id,
			databaseUrl: pooledUrl,
			createdAt: Date.now(),
		},
		created: true,
	};
}

// The template branch carries a better-auth `jwks` row encrypted with the
// machine secret of whoever last booted against it — undecryptable here.
function clearInheritedJwks(directUrl: string): void {
	const res = sh("psql", [directUrl, "-v", "ON_ERROR_STOP=1"], {
		stdin: `DO $$ BEGIN IF to_regclass('public.jwks') IS NOT NULL THEN DELETE FROM public.jwks; END IF; END $$;\n`,
	});
	if (res.code !== 0) {
		fatal(`clearing inherited jwks rows failed:\n${res.stderr}`);
	}
	log("cleared inherited jwks rows (better-auth re-mints on first boot)");
}

// The local broker can come back emptier than the branch's bookmarks (lost data dir,
// pre-flush crash); the worker rightly refuses those, so capy drops them here.
function clearStaleKafkaBookmarks(directUrl: string): void {
	const offsets = sh(
		"bash",
		[
			"-c",
			`. scripts/setup/capy-kafka.sh && "$CAPY_KAFKA_HOME/bin/kafka-get-offsets.sh" --bootstrap-server 127.0.0.1:${KAFKA_PORT}`,
		],
		{ cwd: PROJECT_ROOT },
	);
	if (offsets.code !== 0) {
		log(`skipping kafka bookmark check: ${offsets.stderr}`);
		return;
	}
	const rows = sh("psql", [
		directUrl,
		"-v",
		"ON_ERROR_STOP=1",
		"-Atc",
		"SELECT topic, partition_id, next_offset, command_next_offset FROM partition_progress",
	]);
	if (rows.code !== 0)
		fatal(`reading partition_progress failed:\n${rows.stderr}`);
	const bookmarks: PartitionBookmark[] = rows.stdout
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [topic = "", partition, nextOffset, commandNextOffset] =
				line.split("|");
			return {
				topic,
				partition: Number(partition),
				nextOffset: BigInt(nextOffset ?? "0"),
				commandNextOffset: commandNextOffset ? BigInt(commandNextOffset) : null,
			};
		});
	const stale = findStaleBookmarks({
		bookmarks,
		logEnds: parseLogEndOffsets({ output: offsets.stdout }),
	});
	if (stale.length === 0) return;
	const keys = stale
		.map((b) => `('${b.topic.replace(/'/g, "''")}', ${b.partition})`)
		.join(", ");
	const res = sh("psql", [directUrl, "-v", "ON_ERROR_STOP=1"], {
		stdin: `DELETE FROM partition_progress WHERE (topic, partition_id) IN (${keys});\n`,
	});
	if (res.code !== 0)
		fatal(`clearing stale partition_progress failed:\n${res.stderr}`);
	log(
		`cleared ${stale.length} partition_progress rows ahead of local kafka: ${stale.map((b) => `${b.topic}[${b.partition}]`).join(", ")}`,
	);
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
		waitForHttpService("fakecloud", FAKECLOUD_PORT),
		waitForHttpService("trigger.dev", TRIGGER_PORT, 120),
	]);
	// fakecloud has no startup config for seeding queues; create them like bun dw does.
	await ensureFakecloudQueues({ port: FAKECLOUD_PORT });
	const trigger = ensureTriggerProject();

	// 2. Neon auth + branch + migrations.
	ensureNeonAuth();
	const priorState = loadState();
	const { state: nextState, created } = ensureNeonBranch(machineId, priorState);
	if (!nextState.branchName) fatal("provisioning produced no branchName");
	const directUrl = connectionString(nextState.branchName, { pooled: false });
	applyCommittedMigrations(nextState.branchName, directUrl);
	loadDbFunctions(nextState.branchName, directUrl);
	clearStaleKafkaBookmarks(directUrl);

	// Per-machine secrets — mint on first run, then persist. Server can't
	// boot without BETTER_AUTH_SECRET / ENCRYPTION_IV / ENCRYPTION_PASSWORD.
	const secretsMinted = !priorState?.secrets;
	nextState.secrets = ensureSecrets(priorState);

	// A fresh branch inherits the template's jwks row; a re-minted secret
	// (lost state file) orphans an adopted branch's row the same way.
	if (created || secretsMinted) clearInheritedJwks(directUrl);

	saveState(nextState);
	if (!nextState.databaseUrl) fatal("provisioning produced no databaseUrl");

	// Leaf's chat-sdk wants a separate `chat` DB on the same branch (env.ts
	// rewrites /neondb -> /chat). dw calls this on every setup (not just on
	// branch creation) so a transient Neon hiccup gets retried next time;
	// match that behavior here. Non-fatal — the helper logs and continues.
	if (nextState.branchName) ensureChatDatabase(nextState.branchName);

	// 3. Env files. preload-env.ts at every bun entry point auto-loads these.
	writeEnvFiles(
		nextState.databaseUrl,
		nextState.secrets,
		trigger.secretKey,
		trigger.accessToken,
	);

	runSetupTest(["--ensure"], directUrl);
	runSetupTest(["--ensure-key"], directUrl);

	log(
		`capy provision complete — run \`bun capy\` to start the stack (fresh=${created})`,
	);
}

await main();

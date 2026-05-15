import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type RegistryEntry = {
	path: string;
	worktreeNum: number;
	createdAt: number;
	branchId?: string;
	branchName?: string;
	databaseUrl?: string;
	lastUsedAt?: number;
};

type Registry = Record<string, RegistryEntry>;

const REGISTRY_PATH = join(homedir(), ".autumn-worktrees.json");
const MAX_WORKTREE = 50;
const BRANCH_NAME_RE = /^dw-wt-\d+-[a-f0-9]+$/;
const INACTIVITY_MS = 7 * 24 * 60 * 60 * 1000;

const NEON_PROJECT_ID = "weathered-morning-43833874";
const NEON_TEMPLATE_BRANCH = "dw-template";
const NEON_PARENT_BRANCH = "production";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const SHARED_DIR = join(PROJECT_ROOT, "shared");

function log(msg: string): void {
	console.log(`[dw] ${msg}`);
}

function fatal(msg: string): never {
	console.error(`[dw] ${msg}`);
	process.exit(1);
}

function sh(
	cmd: string,
	args: string[],
	opts: { cwd?: string; env?: Record<string, string>; stdin?: string } = {},
): { stdout: string; stderr: string; code: number } {
	const proc = Bun.spawnSync([cmd, ...args], {
		cwd: opts.cwd,
		env: opts.env ?? (process.env as Record<string, string>),
		stdin: opts.stdin ? new TextEncoder().encode(opts.stdin) : undefined,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		stdout: new TextDecoder().decode(proc.stdout).trim(),
		stderr: new TextDecoder().decode(proc.stderr).trim(),
		code: proc.exitCode ?? 1,
	};
}

function loadRegistry(): Registry {
	if (!existsSync(REGISTRY_PATH)) return {};
	try {
		return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
	} catch {
		log(`registry at ${REGISTRY_PATH} unreadable, resetting`);
		return {};
	}
}

function saveRegistry(reg: Registry): void {
	writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

function getWorktreeList(): string[] {
	const res = sh("git", ["worktree", "list", "--porcelain"], {
		cwd: PROJECT_ROOT,
	});
	if (res.code !== 0) return [];
	return res.stdout
		.split("\n")
		.filter((l) => l.startsWith("worktree "))
		.map((l) => l.slice("worktree ".length).trim());
}

function getCanonicalWorktree(): string {
	const list = getWorktreeList();
	return list[0] ?? PROJECT_ROOT;
}

function getCurrentWorktree(): string {
	const res = sh("git", ["rev-parse", "--show-toplevel"], {
		cwd: PROJECT_ROOT,
	});
	if (res.code !== 0) fatal("not inside a git worktree");
	return res.stdout;
}

function shortHash(input: string): string {
	return createHash("sha1").update(input).digest("hex").slice(0, 6);
}

function allocateWorktreeNumber(
	path: string,
	registry: Registry,
	canonical: string,
): number {
	if (path === canonical) return 1;
	const used = new Set<number>(
		Object.values(registry).map((e) => e.worktreeNum),
	);
	used.add(1);
	const preferred = (parseInt(shortHash(path), 16) % (MAX_WORKTREE - 1)) + 2;
	for (let i = 0; i < MAX_WORKTREE; i++) {
		const candidate = ((preferred - 2 + i) % (MAX_WORKTREE - 1)) + 2;
		if (!used.has(candidate)) return candidate;
	}
	fatal(`no free worktree slot under ${MAX_WORKTREE}`);
}

function deriveBranchName(path: string, worktreeNum: number): string {
	return `dw-wt-${worktreeNum}-${shortHash(path)}`;
}

// ─────────────────────────────────────────────────────────────
// Neon CLI wrappers
// ─────────────────────────────────────────────────────────────

type NeonBranch = {
	id: string;
	name: string;
	created_at?: string;
};

function neon(args: string[]): { stdout: string; stderr: string; code: number } {
	return sh("neon", args);
}

function listBranches(): NeonBranch[] {
	const res = neon([
		"branches",
		"list",
		"--project-id",
		NEON_PROJECT_ID,
		"--output",
		"json",
	]);
	if (res.code !== 0) {
		fatal(`neon branches list failed: ${res.stderr || res.stdout}`);
	}
	try {
		return JSON.parse(res.stdout) as NeonBranch[];
	} catch {
		fatal(`could not parse neon branches list output:\n${res.stdout}`);
	}
}

function findBranchByName(name: string): NeonBranch | undefined {
	return listBranches().find((b) => b.name === name);
}

function createBranch(name: string, parent: string): NeonBranch {
	if (!BRANCH_NAME_RE.test(name) && name !== NEON_TEMPLATE_BRANCH) {
		fatal(`refusing to create branch with unexpected name: ${name}`);
	}
	log(`creating neon branch ${name} (parent: ${parent})`);
	const res = neon([
		"branches",
		"create",
		"--project-id",
		NEON_PROJECT_ID,
		"--name",
		name,
		"--parent",
		parent,
		"--output",
		"json",
	]);
	if (res.code !== 0) {
		fatal(`neon branches create failed: ${res.stderr || res.stdout}`);
	}
	try {
		const parsed = JSON.parse(res.stdout) as { branch?: NeonBranch };
		const branch = parsed.branch ?? (parsed as unknown as NeonBranch);
		if (!branch?.id) fatal(`unexpected neon create output:\n${res.stdout}`);
		return branch;
	} catch {
		fatal(`could not parse neon create output:\n${res.stdout}`);
	}
}

function deleteBranch(idOrName: string): void {
	const res = neon([
		"branches",
		"delete",
		idOrName,
		"--project-id",
		NEON_PROJECT_ID,
	]);
	if (res.code !== 0) {
		console.error(
			`[dw] neon branches delete ${idOrName} failed: ${res.stderr || res.stdout}`,
		);
	} else {
		log(`deleted neon branch ${idOrName}`);
	}
}

function connectionString(
	branchName: string,
	opts: { pooled?: boolean } = {},
): string {
	const args = [
		"connection-string",
		branchName,
		"--project-id",
		NEON_PROJECT_ID,
	];
	if (opts.pooled) args.push("--pooled");
	const res = neon(args);
	if (res.code !== 0) {
		fatal(
			`neon connection-string for ${branchName} failed: ${res.stderr || res.stdout}`,
		);
	}
	return res.stdout.trim();
}

function ensureTemplateBranch(): void {
	const branch = findBranchByName(NEON_TEMPLATE_BRANCH);
	if (branch) return;
	log(`bootstrap: ${NEON_TEMPLATE_BRANCH} missing, creating empty parent`);
	createBranch(NEON_TEMPLATE_BRANCH, NEON_PARENT_BRANCH);
	// Wipe the inherited schema so children start truly empty.
	const url = connectionString(NEON_TEMPLATE_BRANCH);
	const reset = sh("psql", [url, "-v", "ON_ERROR_STOP=1"], {
		stdin: `DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\nCREATE EXTENSION IF NOT EXISTS pg_trgm;\n`,
	});
	if (reset.code !== 0) {
		fatal(`failed to reset ${NEON_TEMPLATE_BRANCH}:\n${reset.stderr}`);
	}
	log(`${NEON_TEMPLATE_BRANCH} ready (empty + pg_trgm)`);
}

// ─────────────────────────────────────────────────────────────
// Migration apply (drizzle-kit generate → psql)
// ─────────────────────────────────────────────────────────────

function listSqlFiles(dir: string): string[] {
	const res = Bun.spawnSync(["ls", dir]);
	const stdout = res.stdout ? new TextDecoder().decode(res.stdout).trim() : "";
	if (!stdout) return [];
	return stdout.split("\n").filter((f) => f.endsWith(".sql"));
}

function writeTempDrizzleConfig(outDir: string): string {
	const tmp = join(SHARED_DIR, `.dw-${process.pid}.config.ts`);
	const content = `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({\n\tdialect: "postgresql",\n\tout: ${JSON.stringify(outDir)},\n\tschema: "./db/schema.ts",\n\tdbCredentials: { url: process.env.DATABASE_URL! },\n});\n`;
	writeFileSync(tmp, content);
	return tmp;
}

function generateAndApplyMigration(
	branchName: string,
	databaseUrl: string,
): void {
	const outDir = join(SHARED_DIR, "drizzle-local", branchName);
	if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });

	const drizzleConfigPath = writeTempDrizzleConfig(outDir);
	try {
		log(`generating initial migration for ${branchName}`);
		const gen = sh(
			"bunx",
			["drizzle-kit", "generate", "--config", drizzleConfigPath],
			{
				cwd: SHARED_DIR,
				env: {
					...(process.env as Record<string, string>),
					NODE_OPTIONS: "--import tsx",
				},
			},
		);
		if (gen.code !== 0) {
			fatal(`drizzle-kit generate failed:\n${gen.stdout}\n${gen.stderr}`);
		}

		const sqlFiles = listSqlFiles(outDir);
		if (sqlFiles.length === 0) {
			fatal(`no .sql files generated in ${outDir}`);
		}

		log(`applying ${sqlFiles.length} migration file(s) to ${branchName}`);
		for (const f of sqlFiles) {
			const p = join(outDir, f);
			const sqlBody = readFileSync(p, "utf-8");
			const mig = sh("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1"], {
				stdin: sqlBody,
			});
			if (mig.code !== 0) {
				fatal(
					`applying migration ${f} failed:\n${mig.stdout}\n${mig.stderr}`,
				);
			}
		}
	} finally {
		if (existsSync(drizzleConfigPath)) rmSync(drizzleConfigPath);
	}
}

function loadDbFunctions(branchName: string, databaseUrl: string): void {
	log(`loading DB functions into ${branchName}`);
	const sqlDir = join(
		PROJECT_ROOT,
		"server",
		"src",
		"internal",
		"balances",
		"utils",
		"sql",
	);
	const sqlFiles = [
		"deductFromRollovers.sql",
		"deductFromMainBalance.sql",
		"unwindFromLockReceipt.sql",
		"getTotalBalance.sql",
		"deductFromAdditionalBalance.sql",
		"getAvailableOverageFromSpendLimit.sql",
		"performDeduction.sql",
		"syncBalances.sql",
		"syncBalancesV2.sql",
		"resetCusEnts.sql",
	];
	for (const f of sqlFiles) {
		const p = join(sqlDir, f);
		const sqlBody = readFileSync(p, "utf-8");
		const res = sh("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1"], {
			stdin: sqlBody,
		});
		if (res.code !== 0) {
			fatal(
				`loading DB function ${f} into ${branchName} failed:\n${res.stdout}\n${res.stderr}`,
			);
		}
	}
}

// ─────────────────────────────────────────────────────────────
// Env / portless / emulate plumbing
// ─────────────────────────────────────────────────────────────

function rewriteDbEnv(
	env: Record<string, string>,
	branchUrl: string,
): Record<string, string> {
	const out = { ...env };
	out.DATABASE_URL = branchUrl;
	out.DATABASE_CRITICAL_URL = branchUrl;
	// Replica URL stays unset for agent branches (read from primary).
	delete out.DATABASE_REPLICA_URL;
	return out;
}

const EMULATE_PID_FILE = join(homedir(), ".autumn-emulate.pid");
const EMULATE_HEALTH_URL =
	"https://google.emulate.localhost/.well-known/openid-configuration";
const START_EMULATE_SH = join(SCRIPT_DIR, "setup", "start-emulate.sh");

function emulateReachable(): boolean {
	const res = sh("curl", [
		"-sf",
		"-o",
		"/dev/null",
		"--max-time",
		"1",
		EMULATE_HEALTH_URL,
	]);
	return res.code === 0;
}

function ensureEmulateRunning(): void {
	if (emulateReachable()) return;
	log("emulate.dev not reachable, spawning daemon");
	const res = sh("bash", [START_EMULATE_SH]);
	if (res.code !== 0) {
		console.error(
			`[dw] failed to start emulate daemon:\n${res.stdout}\n${res.stderr}`,
		);
	}
}

function killPidFromFile(file: string): boolean {
	if (!existsSync(file)) return false;
	const pid = Number(readFileSync(file, "utf-8").trim());
	if (!pid || Number.isNaN(pid)) return false;
	try {
		process.kill(pid, "SIGTERM");
	} catch {}
	rmSync(file, { force: true });
	return true;
}

function killHostProcessByName(name: string): boolean {
	const res = sh("pgrep", ["-f", name]);
	const pids = res.stdout
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean)
		.filter((s) => /^\d+$/.test(s));
	if (pids.length === 0) return false;
	for (const pid of pids) {
		try {
			process.kill(Number(pid), "SIGTERM");
		} catch {}
	}
	return true;
}

function stopEmulateAndPortless(): void {
	const fromPid = killPidFromFile(EMULATE_PID_FILE);
	const fromScan = killHostProcessByName("emulate --portless");
	if (fromPid || fromScan) log("stopped emulate.dev");
	const stop = sh("portless", ["proxy", "stop"]);
	if (stop.code === 0) log("stopped portless proxy");
}

function hasOtherActiveWorktrees(
	registry: Registry,
	currentPath: string,
): boolean {
	return Object.entries(registry).some(
		([p, e]) => p !== currentPath && e.worktreeNum > 1,
	);
}

function killOwnPorts(worktreeNum: number): void {
	const offset = (worktreeNum - 1) * 100;
	const ports = [8080 + offset, 3000 + offset, 3001 + offset];
	if (process.platform === "win32") return;
	const lsof = sh("lsof", ports.flatMap((p) => ["-ti", `:${p}`]));
	const pids = lsof.stdout.split("\n").filter(Boolean);
	for (const pid of pids) {
		try {
			process.kill(Number(pid), "SIGKILL");
		} catch {}
	}
	if (pids.length > 0) {
		log(`killed ${pids.length} process(es) on ports ${ports.join(", ")}`);
	}
}

type WorktreeAliases = {
	apiHost: string;
	apiUrl: string;
	viteHost: string;
	viteUrl: string;
};

function aliasesFor(worktreeNum: number): WorktreeAliases {
	const apiHost = `wt${worktreeNum}-api.localhost`;
	const viteHost = `wt${worktreeNum}.localhost`;
	return {
		apiHost,
		apiUrl: `https://${apiHost}`,
		viteHost,
		viteUrl: `https://${viteHost}`,
	};
}

function registerPortlessAliases(worktreeNum: number): WorktreeAliases {
	const offset = (worktreeNum - 1) * 100;
	const aliases = aliasesFor(worktreeNum);
	const SERVER_PORT = 8080 + offset;
	const VITE_PORT = 3000 + offset;

	for (const [name, port] of [
		[`wt${worktreeNum}-api`, SERVER_PORT],
		[`wt${worktreeNum}`, VITE_PORT],
	] as const) {
		const res = sh("portless", ["alias", name, String(port), "--force"]);
		if (res.code !== 0) {
			console.error(
				`[dw] portless alias ${name} -> ${port} failed: ${res.stderr}`,
			);
		}
	}
	log(
		`portless: ${aliases.viteUrl} → :${VITE_PORT}, ${aliases.apiUrl} → :${SERVER_PORT}`,
	);
	return aliases;
}

function unregisterPortlessAliases(worktreeNum: number): void {
	for (const name of [`wt${worktreeNum}-api`, `wt${worktreeNum}`]) {
		sh("portless", ["alias", "--remove", name]);
	}
}

// ─────────────────────────────────────────────────────────────
// Reconcile (orphan branches + inactivity sweep)
// ─────────────────────────────────────────────────────────────

function reconcile(registry: Registry): Registry {
	const live = new Set(getWorktreeList());
	const next: Registry = {};
	const now = Date.now();
	const orphaned: RegistryEntry[] = [];

	for (const [path, entry] of Object.entries(registry)) {
		if (entry.worktreeNum === 1) {
			next[path] = entry;
			continue;
		}
		const lastUsed = entry.lastUsedAt ?? entry.createdAt;
		const tooStale = now - lastUsed > INACTIVITY_MS;
		if (!live.has(path)) {
			orphaned.push(entry);
		} else if (tooStale) {
			log(
				`reconcile: ${entry.path} unused for ${Math.round(
					(now - lastUsed) / (24 * 60 * 60 * 1000),
				)}d, dropping`,
			);
			orphaned.push(entry);
		} else {
			next[path] = entry;
		}
	}

	for (const o of orphaned) {
		if (o.branchName && BRANCH_NAME_RE.test(o.branchName)) {
			deleteBranch(o.branchName);
		}
		if (o.branchName) {
			const localDir = join(SHARED_DIR, "drizzle-local", o.branchName);
			if (existsSync(localDir))
				rmSync(localDir, { recursive: true, force: true });
		}
	}
	return next;
}

// ─────────────────────────────────────────────────────────────
// Setup / start
// ─────────────────────────────────────────────────────────────

async function setupAgentWorktree(
	entry: RegistryEntry,
	registry: Registry,
): Promise<RegistryEntry> {
	const { branchName } = entry;
	if (!branchName) fatal("entry missing branchName");

	// If branch already exists on Neon and we have a URL, just refresh.
	if (entry.branchId && findBranchByName(branchName)) {
		const url = connectionString(branchName, { pooled: true });
		const next: RegistryEntry = {
			...entry,
			databaseUrl: url,
			lastUsedAt: Date.now(),
		};
		registry[entry.path] = next;
		saveRegistry(registry);
		return next;
	}

	// First-run provisioning.
	log(`first run for ${branchName} — provisioning neon branch`);
	ensureTemplateBranch();
	const branch = createBranch(branchName, NEON_TEMPLATE_BRANCH);
	// Use direct (non-pooled) URL for DDL; pooler can interfere with some DDL paths.
	const directUrl = connectionString(branchName, { pooled: false });
	generateAndApplyMigration(branchName, directUrl);
	loadDbFunctions(branchName, directUrl);
	// Pooled URL for runtime.
	const pooledUrl = connectionString(branchName, { pooled: true });
	const next: RegistryEntry = {
		...entry,
		branchId: branch.id,
		databaseUrl: pooledUrl,
		lastUsedAt: Date.now(),
	};
	registry[entry.path] = next;
	saveRegistry(registry);
	return next;
}

function startDev(entry: RegistryEntry): never {
	const { worktreeNum, branchName, databaseUrl } = entry;
	let env: Record<string, string> = {
		...(process.env as Record<string, string>),
	};
	if (worktreeNum > 1) {
		if (!databaseUrl) fatal("agent worktree missing databaseUrl");
		env = rewriteDbEnv(env, databaseUrl);
		if (!env.EMULATE_GOOGLE_URL) {
			env.EMULATE_GOOGLE_URL = "https://google.emulate.localhost";
		}
		const portlessCa = join(homedir(), ".portless", "ca.pem");
		if (existsSync(portlessCa) && !env.NODE_EXTRA_CA_CERTS) {
			env.NODE_EXTRA_CA_CERTS = portlessCa;
		}
		const aliases = registerPortlessAliases(worktreeNum);
		env.BETTER_AUTH_URL = aliases.apiUrl;
		env.CLIENT_URL = aliases.viteUrl;
		env.VITE_BACKEND_URL = aliases.apiUrl;
		env.VITE_FRONTEND_URL = aliases.viteUrl;
	}

	log(
		`starting dev (worktree=${worktreeNum}${branchName ? `, branch=${branchName}` : ""})`,
	);
	const proc = Bun.spawn(
		[
			"bun",
			"scripts/dev.ts",
			"--worktree",
			String(worktreeNum),
			...process.argv.slice(3),
		],
		{
			cwd: PROJECT_ROOT,
			env,
			stdout: "inherit",
			stderr: "inherit",
		},
	);

	const forward = (sig: NodeJS.Signals) => () => proc.kill(sig);
	process.on("SIGINT", forward("SIGINT"));
	process.on("SIGTERM", forward("SIGTERM"));

	proc.exited.then((code) => process.exit(code ?? 0));
	return undefined as never;
}

// ─────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────

async function cmdDefault(): Promise<void> {
	if (process.env.NODE_ENV === "production") {
		fatal("bun dw is disabled in production");
	}

	const canonical = getCanonicalWorktree();
	const cwd = getCurrentWorktree();
	let registry = loadRegistry();
	registry = reconcile(registry);

	let entry = registry[cwd];
	if (!entry) {
		const worktreeNum = allocateWorktreeNumber(cwd, registry, canonical);
		const branchName =
			worktreeNum === 1 ? undefined : deriveBranchName(cwd, worktreeNum);
		entry = {
			path: cwd,
			worktreeNum,
			createdAt: Date.now(),
			...(branchName && { branchName }),
		};
		registry[cwd] = entry;
		saveRegistry(registry);
		log(
			`registered ${cwd} as worktree ${worktreeNum}${branchName ? ` (branch=${branchName})` : ""}`,
		);
	} else {
		entry.lastUsedAt = Date.now();
		registry[cwd] = entry;
		saveRegistry(registry);
		log(
			`resuming worktree ${entry.worktreeNum}${entry.branchName ? ` (branch=${entry.branchName})` : ""}`,
		);
	}

	if (entry.worktreeNum > 1) {
		entry = await setupAgentWorktree(entry, registry);
		ensureEmulateRunning();
	}

	killOwnPorts(entry.worktreeNum);
	startDev(entry);
}

async function cmdTeardown(opts: { all?: boolean }): Promise<void> {
	let registry = loadRegistry();

	if (opts.all) {
		for (const entry of Object.values(registry)) {
			if (entry.worktreeNum === 1) continue;
			if (entry.branchName) deleteBranch(entry.branchName);
			unregisterPortlessAliases(entry.worktreeNum);
			if (entry.branchName) {
				const localDir = join(
					SHARED_DIR,
					"drizzle-local",
					entry.branchName,
				);
				if (existsSync(localDir))
					rmSync(localDir, { recursive: true, force: true });
			}
		}
		const next: Registry = {};
		for (const [p, e] of Object.entries(registry)) {
			if (e.worktreeNum === 1) next[p] = e;
		}
		saveRegistry(next);
		stopEmulateAndPortless();
		log("teardown --all complete");
		return;
	}

	const cwd = getCurrentWorktree();
	const entry = registry[cwd];
	if (!entry) {
		log(`no registry entry for ${cwd}, nothing to teardown`);
		return;
	}
	if (entry.worktreeNum === 1) {
		fatal("refusing to teardown canonical worktree (worktreeNum=1)");
	}
	if (entry.branchName) deleteBranch(entry.branchName);
	unregisterPortlessAliases(entry.worktreeNum);
	if (entry.branchName) {
		const localDir = join(SHARED_DIR, "drizzle-local", entry.branchName);
		if (existsSync(localDir)) rmSync(localDir, { recursive: true, force: true });
	}
	delete registry[cwd];
	saveRegistry(registry);
	log(`tore down ${entry.branchName ?? "worktree " + entry.worktreeNum}`);

	if (!hasOtherActiveWorktrees(registry, cwd)) {
		stopEmulateAndPortless();
	} else {
		log("other agent worktrees still active; leaving emulate + portless running");
	}
}

function cmdList(): void {
	const registry = loadRegistry();
	const entries = Object.values(registry).sort(
		(a, b) => a.worktreeNum - b.worktreeNum,
	);
	if (entries.length === 0) {
		console.log("(no registered worktrees)");
		return;
	}
	const now = Date.now();
	for (const e of entries) {
		const offset = (e.worktreeNum - 1) * 100;
		const lastUsed = e.lastUsedAt ?? e.createdAt;
		const ageDays = Math.round((now - lastUsed) / (24 * 60 * 60 * 1000));
		console.log(
			`  ${e.worktreeNum.toString().padStart(2)} | ${(
				e.branchName ?? "(canonical)"
			).padEnd(24)} | server :${8080 + offset} vite :${3000 + offset} | ${ageDays}d | ${e.path}`,
		);
	}
}

async function cmdReset(): Promise<void> {
	const cwd = getCurrentWorktree();
	const registry = loadRegistry();
	const entry = registry[cwd];
	if (!entry || entry.worktreeNum === 1) {
		fatal("reset only valid in a registered agent worktree");
	}
	if (entry.branchName) deleteBranch(entry.branchName);
	if (entry.branchName) {
		const localDir = join(SHARED_DIR, "drizzle-local", entry.branchName);
		if (existsSync(localDir)) rmSync(localDir, { recursive: true, force: true });
	}
	const cleared: RegistryEntry = {
		...entry,
		branchId: undefined,
		databaseUrl: undefined,
		lastUsedAt: Date.now(),
	};
	registry[cwd] = cleared;
	saveRegistry(registry);
	log(`reset ${entry.branchName ?? entry.path}, re-provisioning…`);
	await setupAgentWorktree(cleared, registry);
}

async function main(): Promise<void> {
	const sub = process.argv[2];
	if (!sub || sub.startsWith("--")) {
		await cmdDefault();
		return;
	}
	switch (sub) {
		case "teardown":
			await cmdTeardown({ all: process.argv.includes("--all") });
			break;
		case "list":
			cmdList();
			break;
		case "reset":
			await cmdReset();
			break;
		default:
			fatal(`unknown subcommand: ${sub} (use: teardown | list | reset)`);
	}
}

await main();

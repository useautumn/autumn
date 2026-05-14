import {
	createHash,
} from "node:crypto";
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
	schema: string;
	createdAt: number;
};

type Registry = Record<string, RegistryEntry>;

const REGISTRY_PATH = join(homedir(), ".autumn-worktrees.json");
const MAX_WORKTREE = 50;
const SCHEMA_NAME_RE = /^wt_[a-f0-9]{6}_\d+$/;

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

function shInherit(
	cmd: string,
	args: string[],
	opts: { cwd?: string; env?: Record<string, string> } = {},
): number {
	const proc = Bun.spawnSync([cmd, ...args], {
		cwd: opts.cwd,
		env: opts.env ?? (process.env as Record<string, string>),
		stdout: "inherit",
		stderr: "inherit",
	});
	return proc.exitCode ?? 1;
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
	if (list.length === 0) {
		// fallback: project root
		return PROJECT_ROOT;
	}
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

function deriveSchema(path: string, worktreeNum: number): string {
	if (worktreeNum === 1) return "public";
	return `wt_${shortHash(path)}_${worktreeNum}`;
}

function reconcile(registry: Registry, databaseUrl: string): Registry {
	const live = new Set(getWorktreeList());
	const next: Registry = {};
	const orphaned: RegistryEntry[] = [];
	for (const [path, entry] of Object.entries(registry)) {
		if (live.has(path) || entry.worktreeNum === 1) {
			next[path] = entry;
		} else {
			orphaned.push(entry);
		}
	}
	for (const o of orphaned) {
		if (!SCHEMA_NAME_RE.test(o.schema)) continue;
		log(`reconcile: dropping orphaned schema ${o.schema} (path gone: ${o.path})`);
		dropSchema(o.schema, databaseUrl);
		const localDir = join(SHARED_DIR, "drizzle-local", o.schema);
		if (existsSync(localDir)) rmSync(localDir, { recursive: true, force: true });
	}
	return next;
}

function schemaExists(schema: string, databaseUrl: string): boolean {
	const res = sh(
		"psql",
		[
			databaseUrl,
			"-tAc",
			`SELECT 1 FROM information_schema.schemata WHERE schema_name = '${schema}'`,
		],
	);
	if (res.code !== 0) {
		fatal(`psql check failed: ${res.stderr}`);
	}
	return res.stdout.trim() === "1";
}

function dropSchema(schema: string, databaseUrl: string): void {
	if (!SCHEMA_NAME_RE.test(schema)) {
		fatal(`refusing to drop schema with unexpected name: ${schema}`);
	}
	const res = sh("psql", [
		databaseUrl,
		"-c",
		`DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
	]);
	if (res.code !== 0) {
		console.error(`[dw] drop schema ${schema} failed: ${res.stderr}`);
	}
}

function createSchema(schema: string, databaseUrl: string): void {
	const res = sh("psql", [
		databaseUrl,
		"-c",
		`CREATE SCHEMA IF NOT EXISTS "${schema}"`,
	]);
	if (res.code !== 0) {
		fatal(`CREATE SCHEMA ${schema} failed: ${res.stderr}`);
	}
}

function rewriteDatabaseUrl(url: string, schema: string): string {
	const u = new URL(url);
	const optsValue = `-c search_path=${schema},public`;
	u.searchParams.set("options", optsValue);
	return u.toString();
}

function rewriteDbEnv(
	env: Record<string, string>,
	schema: string,
): Record<string, string> {
	const out = { ...env };
	for (const key of [
		"DATABASE_URL",
		"DATABASE_CRITICAL_URL",
		"DATABASE_REPLICA_URL",
	]) {
		const v = out[key];
		if (v) out[key] = rewriteDatabaseUrl(v, schema);
	}
	return out;
}

async function generateInitialMigration(
	schema: string,
	databaseUrl: string,
): Promise<void> {
	const outDir = join(SHARED_DIR, "drizzle-local", schema);
	if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });

	log(`generating initial migration for ${schema}`);
	const gen = sh(
		"bunx",
		[
			"drizzle-kit",
			"generate",
			"--config",
			"drizzle.config.ts",
			"--out",
			outDir,
			"--name",
			"initial",
		],
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

	const sqlFiles = Bun.spawnSync(["ls", outDir]).stdout
		? new TextDecoder()
				.decode(Bun.spawnSync(["ls", outDir]).stdout)
				.trim()
				.split("\n")
				.filter((f) => f.endsWith(".sql"))
		: [];
	if (sqlFiles.length === 0) {
		fatal(`no .sql files generated in ${outDir}`);
	}

	for (const f of sqlFiles) {
		const p = join(outDir, f);
		const original = readFileSync(p, "utf-8");
		const rewritten = original.replace(/"public"\./g, `"${schema}".`);
		writeFileSync(p, rewritten);
	}
	log(`rewrote ${sqlFiles.length} migration file(s) public → ${schema}`);

	const migrateUrl = rewriteDatabaseUrl(databaseUrl, schema);
	log(`applying initial migration into ${schema}`);
	const drizzleConfigPath = writeTempMigrateConfig(outDir);
	try {
		const mig = sh(
			"bunx",
			[
				"drizzle-kit",
				"migrate",
				"--config",
				drizzleConfigPath,
			],
			{
				cwd: SHARED_DIR,
				env: {
					...(process.env as Record<string, string>),
					NODE_OPTIONS: "--import tsx",
					DATABASE_URL: migrateUrl,
				},
			},
		);
		if (mig.code !== 0) {
			fatal(`drizzle-kit migrate failed:\n${mig.stdout}\n${mig.stderr}`);
		}
	} finally {
		if (existsSync(drizzleConfigPath)) rmSync(drizzleConfigPath);
	}
}

function writeTempMigrateConfig(outDir: string): string {
	const tmp = join(SHARED_DIR, `.dw-migrate-${process.pid}.config.ts`);
	const content = `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({\n\tdialect: "postgresql",\n\tout: ${JSON.stringify(outDir)},\n\tschema: "./db/schema.ts",\n\tdbCredentials: { url: process.env.DATABASE_URL! },\n});\n`;
	writeFileSync(tmp, content);
	return tmp;
}

async function loadDbFunctions(
	schema: string,
	databaseUrl: string,
): Promise<void> {
	log(`loading DB functions into ${schema}`);
	const migrateUrl = rewriteDatabaseUrl(databaseUrl, schema);
	const code = shInherit(
		"bun",
		[
			"-e",
			`import { initializeDatabaseFunctions } from "./src/db/initializeDatabaseFunctions.js"; await initializeDatabaseFunctions(); process.exit(0);`,
		],
		{
			cwd: join(PROJECT_ROOT, "server"),
			env: {
				...(process.env as Record<string, string>),
				DATABASE_URL: migrateUrl,
			},
		},
	);
	if (code !== 0) {
		fatal(`loading DB functions into ${schema} failed (exit ${code})`);
	}
}

async function setupSchemaIfMissing(
	schema: string,
	databaseUrl: string,
): Promise<void> {
	if (schemaExists(schema, databaseUrl)) {
		log(`schema ${schema} already exists, skipping setup`);
		return;
	}
	log(`first run for ${schema} — provisioning`);
	createSchema(schema, databaseUrl);
	await generateInitialMigration(schema, databaseUrl);
	await loadDbFunctions(schema, databaseUrl);
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

function startDev(
	worktreeNum: number,
	schema: string,
	databaseUrl: string,
): never {
	const env = rewriteDbEnv(
		{ ...(process.env as Record<string, string>) },
		schema,
	);
	env.DB_SCHEMA = schema;
	if (worktreeNum > 1 && !env.EMULATE_GOOGLE_URL) {
		env.EMULATE_GOOGLE_URL = "https://google.emulate.localhost";
	}

	log(`starting dev (worktree=${worktreeNum}, schema=${schema})`);
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

async function cmdDefault(): Promise<void> {
	if (process.env.NODE_ENV === "production") {
		fatal("bun dw is disabled in production");
	}
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) fatal("DATABASE_URL not set (is infisical wrapping bun dw?)");

	const canonical = getCanonicalWorktree();
	const cwd = getCurrentWorktree();

	let registry = loadRegistry();
	registry = reconcile(registry, databaseUrl);

	let entry = registry[cwd];
	if (!entry) {
		const worktreeNum = allocateWorktreeNumber(cwd, registry, canonical);
		const schema = deriveSchema(cwd, worktreeNum);
		entry = { path: cwd, worktreeNum, schema, createdAt: Date.now() };
		registry[cwd] = entry;
		saveRegistry(registry);
		log(`registered ${cwd} as worktree ${worktreeNum} (schema=${schema})`);
	} else {
		log(`resuming worktree ${entry.worktreeNum} (schema=${entry.schema})`);
	}

	if (entry.worktreeNum > 1) {
		await setupSchemaIfMissing(entry.schema, databaseUrl);
	}

	killOwnPorts(entry.worktreeNum);
	startDev(entry.worktreeNum, entry.schema, databaseUrl);
}

async function cmdTeardown(opts: { all?: boolean }): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) fatal("DATABASE_URL not set");
	const registry = loadRegistry();

	if (opts.all) {
		const next = reconcile(registry, databaseUrl);
		saveRegistry(next);
		log("teardown --all complete (orphaned schemas dropped)");
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
	dropSchema(entry.schema, databaseUrl);
	const localDir = join(SHARED_DIR, "drizzle-local", entry.schema);
	if (existsSync(localDir)) rmSync(localDir, { recursive: true, force: true });
	delete registry[cwd];
	saveRegistry(registry);
	log(`tore down ${entry.schema}`);
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
	for (const e of entries) {
		const offset = (e.worktreeNum - 1) * 100;
		console.log(
			`  ${e.worktreeNum.toString().padStart(2)} | ${e.schema.padEnd(20)} | server :${8080 + offset} vite :${3000 + offset} | ${e.path}`,
		);
	}
}

async function cmdReset(): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) fatal("DATABASE_URL not set");
	const cwd = getCurrentWorktree();
	const registry = loadRegistry();
	const entry = registry[cwd];
	if (!entry || entry.worktreeNum === 1) {
		fatal("reset only valid in a registered agent worktree");
	}
	dropSchema(entry.schema, databaseUrl);
	const localDir = join(SHARED_DIR, "drizzle-local", entry.schema);
	if (existsSync(localDir)) rmSync(localDir, { recursive: true, force: true });
	log(`reset ${entry.schema}, re-running setup`);
	await setupSchemaIfMissing(entry.schema, databaseUrl);
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

#!/usr/bin/env bun
/**
 * spike.ts — one-shot validator for `bun tw` Steps 2 + 3 (plan §5a) on ONE
 * Vercel µVM. Run this BEFORE trusting the swarm: it proves the unrun
 * `image/*.sh` actually build the native stack and warm a ref-fresh snapshot.
 *
 * What it does, end to end, on a single sandbox:
 *   1. Create a Vercel sandbox from this repo at the chosen git ref.
 *   2. Run image/build-base.sh   → PG18 + pg_trgm, Dragonfly, elasticmq-native,
 *                                  bun; an EMPTY `autumn` DB (extension, no tables).
 *   3. Run image/start-services.sh + VERIFY the base (ports, queues, empty DB).
 *   4. Run image/warmup.sh <ref> → migrate --bootstrap → migrate-functions →
 *                                  seed (NO Stripe account) → clean-stop.
 *   5. Restart services + VERIFY the warm state (tables exist, org seeded, and
 *      crucially NO Stripe sub-account in the warm parent), then clean-stop.
 *   6. sandbox.snapshot() → prints the snapshot id (this is the warm snapshot
 *      the swarm would fork from). The snapshot call stops the sandbox.
 *
 * Auth / prerequisites (see plan §10):
 *   - `vercel link` then `vercel env pull` so `.env.local` has VERCEL_OIDC_TOKEN
 *     (Bun auto-loads .env.local). Or set VERCEL_TOKEN + VERCEL_TEAM_ID +
 *     VERCEL_PROJECT_ID for CI.
 *   - For a PRIVATE repo clone, set GITHUB_TOKEN (a PAT/installation token).
 *
 * Env knobs:
 *   TW_REF                 git ref to test          (default: current branch)
 *   TW_GIT_URL             repo URL to clone        (default: origin remote)
 *   GITHUB_TOKEN/GH_TOKEN  private-repo clone auth   (optional)
 *   TW_VCPUS               vCPUs for the µVM         (default: 4 → 8 GB)
 *   TW_INSTALL_CLICKHOUSE  =1 to include ClickHouse  (default: off)
 *   TW_KEEP / --keep       don't delete the sandbox on failure (debug)
 *
 * This is a SPIKE: build-base.sh targets Amazon Linux 2023 (dnf) and is the part
 * most likely to need iteration (package names, binary URLs). Failures here are
 * expected and informative — read the streamed [tw-build-base]/[tw-warmup] logs.
 */

import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import { SERVER_PORT } from "./constants.ts";
import { getOwner } from "./helpers/owner.ts";

const SANDBOX_DIR = "/vercel/sandbox";
const UNIT_TEST_ORG_ID = "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt";
const BUILD_TIMEOUT_MS = 30 * 60 * 1000;
const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000;

/** Run a local git command and return trimmed stdout (orchestrator side). */
const git = (...args: string[]): string => {
	const proc = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
	return new TextDecoder().decode(proc.stdout).trim();
};

const log = (msg: string): void => console.log(`\n\x1b[1m[tw-spike]\x1b[0m ${msg}`);
const fail = (msg: string): never => {
	console.error(`\n\x1b[31m[tw-spike] FAIL:\x1b[0m ${msg}`);
	process.exit(1);
};

/** A Writable that tees the sandbox command's output to our stdout. */
const teeWritable = (): Writable =>
	new Writable({
		write(chunk, _enc, cb) {
			process.stdout.write(chunk);
			cb();
		},
	});

/** Stream a command's output live; throw on non-zero exit. */
const stream = async (
	sandbox: Sandbox,
	cmd: string,
	args: string[],
	opts: { cwd?: string; env?: Record<string, string>; label: string; timeoutMs?: number },
): Promise<void> => {
	log(`▶ ${opts.label}: ${cmd} ${args.join(" ")}`);
	const finished = await sandbox.runCommand({
		cmd,
		args,
		cwd: opts.cwd ?? SANDBOX_DIR,
		env: opts.env,
		stdout: teeWritable(),
		stderr: teeWritable(),
		timeoutMs: opts.timeoutMs,
	});
	if (finished.exitCode !== 0) {
		fail(`${opts.label} exited ${finished.exitCode}`);
	}
};

/** Run a command and capture its stdout (for verification probes). */
const capture = async (
	sandbox: Sandbox,
	script: string,
): Promise<string> => {
	const finished = await sandbox.runCommand({ cmd: "bash", args: ["-lc", script] });
	const out = await finished.stdout();
	if (finished.exitCode !== 0) {
		const err = await finished.stderr();
		fail(`verification probe exited ${finished.exitCode}:\n${err}`);
	}
	return out;
};

/** Parse `KEY=value` lines from a probe's stdout into a map. */
const parseKv = (out: string): Record<string, string> => {
	const map: Record<string, string> = {};
	for (const line of out.split("\n")) {
		const eq = line.indexOf("=");
		if (eq > 0) {
			map[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
		}
	}
	return map;
};

const assert = (cond: boolean, label: string, detail: string): void => {
	if (cond) {
		console.log(`  \x1b[32m✓\x1b[0m ${label} — ${detail}`);
	} else {
		fail(`${label} — ${detail}`);
	}
};

// Shared PATH + psql auth preamble so probes find the versioned PG binaries.
const PROBE_PREAMBLE = [
	"export PATH=/usr/pgsql-18/bin:/opt/autumn-tw/bin:$HOME/.bun/bin:$PATH",
	"export PGPASSWORD=postgres",
	'PSQL() { psql -h localhost -p 5432 -U postgres -d autumn -tAc "$1"; }',
].join("\n");

const verifyBase = async (sandbox: Sandbox): Promise<void> => {
	log("Verifying BASE (Step 2): services up, empty DB + pg_trgm");
	const out = await capture(
		sandbox,
		`${PROBE_PREAMBLE}
echo "TABLES=$(PSQL "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
echo "TRGM=$(PSQL "SELECT count(*) FROM pg_extension WHERE extname='pg_trgm'")"
echo "REDIS=$(redis-cli -p 6379 PING)"
echo "QUEUES=$(curl -sf 'http://localhost:9324/?Action=ListQueues&Version=2012-11-05' | grep -o 'autumn[a-z-]*\\.fifo' | sort -u | tr '\\n' ',')"
echo "BUN=$(bun --version)"`,
	);
	const kv = parseKv(out);
	assert(kv.TABLES === "0", "empty DB", `public tables = ${kv.TABLES} (want 0)`);
	assert(kv.TRGM === "1", "pg_trgm installed", `pg_extension rows = ${kv.TRGM}`);
	assert(kv.REDIS === "PONG", "Dragonfly :6379", `PING → ${kv.REDIS}`);
	assert(
		kv.QUEUES.includes("autumn.fifo") && kv.QUEUES.includes("autumn-track.fifo"),
		"elasticmq :9324 queues",
		kv.QUEUES || "(none)",
	);
	assert(Boolean(kv.BUN), "bun installed", `v${kv.BUN}`);
};

const verifyWarm = async (sandbox: Sandbox): Promise<void> => {
	log("Verifying WARM (Step 3): tables migrated, org seeded, NO Stripe account");
	const out = await capture(
		sandbox,
		`${PROBE_PREAMBLE}
echo "TABLES=$(PSQL "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
echo "ORG=$(PSQL "SELECT slug FROM organizations WHERE id='${UNIT_TEST_ORG_ID}'")"
echo "STRIPE_ACCT=$(PSQL "SELECT coalesce(test_stripe_connect->>'default_account_id','<none>') FROM organizations WHERE id='${UNIT_TEST_ORG_ID}'")"`,
	);
	const kv = parseKv(out);
	assert(Number(kv.TABLES) > 0, "schema migrated", `public tables = ${kv.TABLES} (want > 0)`);
	assert(kv.ORG === "unit-test-org", "test org seeded", `slug = ${kv.ORG || "(missing)"}`);
	assert(
		kv.STRIPE_ACCT === "<none>",
		"NO Stripe sub-account in warm parent",
		`default_account_id = ${kv.STRIPE_ACCT} (the per-worker boot mints it; warm must skip)`,
	);
};

const main = async (): Promise<void> => {
	const ref = process.env.TW_REF || git("rev-parse", "--abbrev-ref", "HEAD") || "HEAD";

	let url = process.env.TW_GIT_URL || git("config", "--get", "remote.origin.url");
	if (!url) {
		fail("no git URL — set TW_GIT_URL or run inside a repo with an `origin` remote");
	}
	// Normalize ssh → https (the µVM clones over https, not your local SSH key).
	if (url.startsWith("git@github.com:")) {
		url = `https://github.com/${url.slice("git@github.com:".length)}`;
	}
	url = `${url.replace(/\.git$/, "")}.git`;

	const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

	// Pre-flight: fail fast locally with actionable guidance instead of a cryptic
	// Vercel "git clone failed" 400. The µVM clones the PUSHED ref over https.
	if (url.includes("github.com") && !token) {
		fail(
			"private GitHub repo needs auth — set GITHUB_TOKEN (a PAT/installation token with repo read) in .env.local or the env, then re-run.",
		);
	}
	if (!git("ls-remote", "origin", ref)) {
		fail(
			`ref "${ref}" is not on origin — commit and push it first:\n` +
				`    git push -u origin ${ref}\n` +
				"(the µVM clones the PUSHED ref; local-only commits won't be there.)",
		);
	}
	if (git("status", "--porcelain")) {
		console.warn(
			`\n\x1b[33m[tw-spike] WARNING:\x1b[0m uncommitted changes detected. The µVM clones the ` +
				`PUSHED ref @ ${ref}, so anything not committed + pushed (e.g. the bun tw scripts) ` +
				"will NOT be in the sandbox. Commit + push first, or you're testing stale code.\x1b[0m",
		);
	}

	const vcpus = Number(process.env.TW_VCPUS || "4");
	const installClickhouse = process.env.TW_INSTALL_CLICKHOUSE === "1";
	const keep = process.env.TW_KEEP === "1" || process.argv.includes("--keep");
	const owner = getOwner();
	const name = `tw-spike-${owner}-${Date.now().toString(36)}`;

	// Private-repo clones use the username/password source variant (token as the
	// password). Public repos use the plain variant.
	const source = token
		? { type: "git" as const, url, username: "x-access-token", password: token, revision: ref, depth: 1 }
		: { type: "git" as const, url, revision: ref, depth: 1 };

	log(`Creating µVM '${name}' from ${url} @ ${ref} (${vcpus} vCPU)`);
	const sandbox = await Sandbox.create({
		name,
		source,
		ports: [SERVER_PORT],
		timeout: SANDBOX_TIMEOUT_MS,
		resources: { vcpus },
		runtime: "node24",
		persistent: false,
		tags: { owner, run: "spike", kind: "bun-tw" },
	});
	log(`Sandbox up. name=${name}  preview=${sandbox.domain(SERVER_PORT)}`);

	let snapshotId: string | undefined;
	try {
		// Step 2 — base image.
		await stream(sandbox, "bash", ["scripts/tw/image/build-base.sh"], {
			label: "build-base",
			timeoutMs: BUILD_TIMEOUT_MS,
			env: installClickhouse ? { TW_INSTALL_CLICKHOUSE: "1" } : undefined,
		});
		await stream(sandbox, "bash", ["scripts/tw/image/start-services.sh"], {
			label: "start-services",
			env: installClickhouse ? { TW_START_CLICKHOUSE: "1" } : undefined,
		});
		await verifyBase(sandbox);

		// Step 3 — warm snapshot (warmup ends by clean-stopping services).
		await stream(sandbox, "bash", ["scripts/tw/image/warmup.sh", ref], {
			label: "warmup",
			timeoutMs: BUILD_TIMEOUT_MS,
		});

		// Restart services to verify the migrated/seeded state, then clean-stop
		// again so the snapshot is filesystem-consistent (plan §5a step 6).
		await stream(sandbox, "bash", ["scripts/tw/image/start-services.sh"], {
			label: "start-services (verify)",
		});
		await verifyWarm(sandbox);
		await stream(sandbox, "bash", ["scripts/tw/image/stop-services.sh"], {
			label: "stop-services",
		});

		log("Taking warm snapshot (this stops the sandbox)…");
		const snapshot = await sandbox.snapshot();
		snapshotId = snapshot.snapshotId;
		log(`\x1b[32m✅ Steps 2 + 3 PASSED.\x1b[0m warm snapshot id = ${snapshotId}`);
		console.log("\nFork the swarm from this snapshot (or re-run to rebuild).");
	} catch (error) {
		console.error(error);
		if (keep) {
			log(`Left sandbox '${name}' running for debugging (TW_KEEP). Inspect via the Vercel Sandboxes dashboard, then delete it.`);
		} else {
			log(`Tearing down sandbox '${name}' (set TW_KEEP=1 to keep it for debugging).`);
			await sandbox.delete().catch(() => undefined);
		}
		process.exit(1);
	}
};

await main();

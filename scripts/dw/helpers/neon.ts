import { sh, fatal, log } from "./shell.ts";
import {
	NEON_PROJECT_ID,
	NEON_TEMPLATE_BRANCH,
	NEON_PARENT_BRANCH,
	BRANCH_NAME_RE,
} from "../constants.ts";
import type { NeonBranch } from "../types.ts";

function neon(args: string[]): { stdout: string; stderr: string; code: number } {
	return sh("neon", args);
}

export function listBranches(): NeonBranch[] {
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

export function findBranchByName(name: string): NeonBranch | undefined {
	return listBranches().find((b) => b.name === name);
}

export function createBranch(name: string, parent: string): NeonBranch {
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

export function deleteBranch(idOrName: string): void {
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

export function connectionString(
	branchName: string,
	opts: { pooled?: boolean } = {},
): string {
	const args = [
		"connection-string",
		branchName,
		"--project-id",
		NEON_PROJECT_ID,
		// The branch has both `neondb` and `chat` DBs (ensureChatDatabase), so neon
		// errors on ambiguity without this. env.ts rewrites the path to /chat where
		// the chat-sdk needs it.
		"--database-name",
		"neondb",
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

// Leaf's chat-sdk connects to a separate `chat` database on the same branch
// (env.ts rewrites DATABASE_URL's path to /chat). Create it via the Neon control
// plane (no CREATE DATABASE privilege / pooler issues), owned by the same role as
// neondb so leaf can connect. Idempotent + non-fatal.
export function ensureChatDatabase(branchName: string): void {
	const list = neon([
		"databases",
		"list",
		"--project-id",
		NEON_PROJECT_ID,
		"--branch",
		branchName,
		"--output",
		"json",
	]);
	if (list.code !== 0) {
		console.error(
			`[dw] neon databases list for ${branchName} failed: ${list.stderr || list.stdout}`,
		);
		return;
	}
	let databases: { name: string; owner_name: string }[];
	try {
		databases = JSON.parse(list.stdout) as {
			name: string;
			owner_name: string;
		}[];
	} catch {
		console.error(`[dw] could not parse neon databases list for ${branchName}`);
		return;
	}
	if (databases.some((db) => db.name === "chat")) {
		log(`chat database already present on ${branchName}`);
		return;
	}
	const owner =
		databases.find((db) => db.name === "neondb")?.owner_name ??
		databases[0]?.owner_name ??
		"neondb_owner";
	log(`creating chat database on ${branchName} (owner ${owner})`);
	const create = neon([
		"databases",
		"create",
		"--project-id",
		NEON_PROJECT_ID,
		"--branch",
		branchName,
		"--name",
		"chat",
		"--owner-name",
		owner,
	]);
	if (create.code !== 0) {
		console.error(
			`[dw] neon databases create chat on ${branchName} failed: ${create.stderr || create.stdout}`,
		);
		return;
	}
	log(`chat database created on ${branchName}`);
}

export function ensureTemplateBranch(): void {
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

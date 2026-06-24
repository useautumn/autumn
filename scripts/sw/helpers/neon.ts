import { NEON_PROJECT_ID, NEON_TEMPLATE_BRANCH } from "../../dw/constants.ts";
import { connectionString, listBranches } from "../../dw/helpers/neon.ts";
import { fatal, log, sh } from "./shell.ts";

/** Names of all sw-managed Neon branches (for orphan cleanup). */
export function listSwBranchNames(): string[] {
	return listBranches()
		.filter((branch) => branch.name.startsWith("sw-"))
		.map((branch) => branch.name);
}

export type SwBranch = { id: string; name: string; databaseUrl: string };

/**
 * Issue a Neon branch from the Mac (reusing local neon auth, so the devbox never
 * needs Neon credentials) off the same `dw-template` dw branches from — so the
 * schema is already seeded. The box connects to this over the network, which is
 * why the DB survives a box rebuild.
 */
export function createSwBranch(slug: string): SwBranch {
	const name = `sw-${slug}-${crypto.randomUUID().slice(0, 7)}`.slice(0, 60);
	log(`creating neon branch ${name} (parent: ${NEON_TEMPLATE_BRANCH})`);
	const res = sh("neon", [
		"branches",
		"create",
		"--project-id",
		NEON_PROJECT_ID,
		"--name",
		name,
		"--parent",
		NEON_TEMPLATE_BRANCH,
		"--output",
		"json",
	]);
	if (res.code !== 0) {
		fatal(`neon branches create failed: ${res.stderr || res.stdout}`);
	}
	let id: string;
	try {
		const parsed = JSON.parse(res.stdout) as { branch?: { id?: string } };
		const branchId = parsed.branch?.id;
		if (!branchId) fatal(`unexpected neon create output:\n${res.stdout}`);
		id = branchId;
	} catch {
		fatal(`could not parse neon create output:\n${res.stdout}`);
	}
	return { id, name, databaseUrl: connectionString(name) };
}

export function deleteSwBranch(idOrName: string): void {
	const res = sh("neon", [
		"branches",
		"delete",
		idOrName,
		"--project-id",
		NEON_PROJECT_ID,
	]);
	if (res.code !== 0) {
		console.error(
			`[sw] neon branches delete ${idOrName} failed: ${res.stderr || res.stdout}`,
		);
	} else {
		log(`deleted neon branch ${idOrName}`);
	}
}

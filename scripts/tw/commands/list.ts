/**
 * `bun tw list` — show this user's runs + orphan flags (plan §9a).
 *
 * Reads the authoritative registry, filters to the current OS owner, and prints
 * each run with its status + an orphan flag (orphan = `status != completed`, or
 * sandboxes still reported alive by Vercel). Cross-checks
 * `vercel.listSandboxesByOwner` when available to surface sandboxes the registry
 * missed (e.g. a SIGKILL'd run) — that cross-check degrades gracefully (the
 * Vercel API needs `VERCEL_PROJECT_ID`; without it we still print the registry).
 */

import chalk from "chalk";
import { getOwner } from "../helpers/owner.ts";
import { listRuns } from "../helpers/registry.ts";
import { listSandboxesByOwner } from "../helpers/vercel.ts";
import type { RegistryEntry } from "../types.ts";

const ALIVE_STATUSES = new Set([
	"pending",
	"running",
	"stopping",
	"snapshotting",
]);

const statusColor = (status: RegistryEntry["status"]): string => {
	switch (status) {
		case "completed":
			return chalk.green(status);
		case "running":
			return chalk.yellow(status);
		case "cancelled":
			return chalk.red(status);
		default:
			return status;
	}
};

const formatAge = (startedAt: number): string => {
	const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
	if (seconds < 60) {
		return `${seconds}s ago`;
	}
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.round(minutes / 60);
	return `${hours}h ago`;
};

export const list = async (): Promise<void> => {
	const owner = getOwner();
	const runs = await listRuns(owner);

	if (runs.length === 0) {
		console.log(chalk.dim(`No bun tw runs recorded for "${owner}".`));
		return;
	}

	// Cross-check Vercel for sandboxes still alive (orphan detection beyond the
	// registry's own status). Degrades to "registry only" when unavailable.
	const aliveByName = new Map<string, string>();
	try {
		for (const sandbox of await listSandboxesByOwner(owner)) {
			aliveByName.set(sandbox.name, sandbox.status);
		}
	} catch (error) {
		console.log(
			chalk.dim(
				`(vercel cross-check unavailable: ${(error as Error).message})`,
			),
		);
	}

	console.log(chalk.bold(`bun tw runs for "${owner}":`));
	for (const run of runs) {
		const aliveSandboxes = run.sandboxes.filter((sandbox) => {
			const status = aliveByName.get(sandbox.name);
			return status !== undefined && ALIVE_STATUSES.has(status);
		});
		const isOrphan = run.status !== "completed" || aliveSandboxes.length > 0;

		const header = [
			chalk.bold(run.runId),
			statusColor(run.status),
			`ref=${run.ref}`,
			formatAge(run.startedAt),
			isOrphan ? chalk.red("ORPHAN") : chalk.green("clean"),
		].join("  ");
		console.log(`\n${header}`);

		console.log(
			chalk.dim(
				`  sandboxes: ${run.sandboxes.length}` +
					(aliveSandboxes.length > 0
						? chalk.red(` (${aliveSandboxes.length} still alive)`)
						: "") +
					`  sub-accounts: ${run.subAccounts.length}` +
					`  webhooks: ${run.webhooks.length}` +
					(run.svixAppId ? `  svix-app: ${run.svixAppId}` : ""),
			),
		);

		if (isOrphan) {
			console.log(chalk.dim(`  → recover with: bun tw kill ${run.runId}`));
		}
	}

	console.log(
		chalk.dim(
			"\nClean up: `bun tw kill <runId>` | `bun tw kill-all` | `bun tw kill --orphans`",
		),
	);
};

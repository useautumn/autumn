#!/usr/bin/env bun
/**
 * Throwaway orgs for ax-evals: each eval run gets its own org + sandbox key so
 * concurrent runs never share state and a real `atmn push` lands somewhere
 * disposable.
 *
 *   bun scripts/setupTestUtils/evalOrg.ts create <runId>   → prints {orgId, secretKey}
 *   bun scripts/setupTestUtils/evalOrg.ts delete <runId>
 *   bun scripts/setupTestUtils/evalOrg.ts sweep            → deletes eval orgs older than a day
 *
 * Worktree .env.local (DATABASE_URL) loads via scripts/preload-env.ts.
 */
import { AppEnv, organizations } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import {
	ApiKeyPrefix,
	createKey,
} from "@server/internal/dev/apiKeys/apiKeyUtils.js";
import { clearOrgDbOnly } from "@tests/utils/setup/clearOrg.js";
import { and, eq, like, lt } from "drizzle-orm";

// clearOrg's allowlist only touches test-* slugs; keep eval orgs inside it.
const SLUG_PREFIX = "test-ax-eval-";
const SWEEP_AGE_MS = 24 * 60 * 60 * 1000;

const orgIdFor = (runId: string) => `${SLUG_PREFIX}${runId}`;

const createEvalOrg = async ({
	db,
	runId,
}: {
	db: DrizzleCli;
	runId: string;
}): Promise<{ orgId: string; secretKey: string }> => {
	const orgId = orgIdFor(runId);
	const now = Date.now();
	await db.insert(organizations).values({
		id: orgId,
		slug: orgId,
		name: `AX Eval ${runId}`,
		createdAt: new Date(now),
		created_at: now,
		stripe_connected: false,
		default_currency: "usd",
		onboarded: true,
	});
	const secretKey = await createKey({
		db,
		env: AppEnv.Sandbox,
		name: "AX Eval Key",
		orgId,
		prefix: ApiKeyPrefix.Sandbox,
		meta: { createdBy: "ax-evals", createdAt: new Date(now).toISOString() },
	});
	return { orgId, secretKey };
};

const deleteEvalOrg = async ({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}): Promise<void> => {
	if (!orgId.startsWith(SLUG_PREFIX))
		throw new Error(`refusing to delete non-eval org "${orgId}"`);
	await clearOrgDbOnly({ db, orgId, env: AppEnv.Sandbox });
	// api_keys and memberships cascade from the org row.
	await db.delete(organizations).where(eq(organizations.id, orgId));
};

const sweepEvalOrgs = async ({ db }: { db: DrizzleCli }): Promise<number> => {
	const stale = await db
		.select({ id: organizations.id })
		.from(organizations)
		.where(
			and(
				like(organizations.id, `${SLUG_PREFIX}%`),
				lt(organizations.created_at, Date.now() - SWEEP_AGE_MS),
			),
		);
	for (const org of stale) await deleteEvalOrg({ db, orgId: org.id });
	return stale.length;
};

/** Eval orgs only ever belong on a dev database: localhost, or this
 * worktree's own registered dw Neon branch. A prod/staging DATABASE_URL
 * (e.g. inherited from `bun p` / prod Infisical) must hard-fail before any
 * write. */
const assertDevDatabase = async () => {
	const url = process.env.DATABASE_URL ?? "";
	let host = "";
	try {
		host = new URL(url).hostname;
	} catch {
		throw new Error("DATABASE_URL is unset or unparseable — refusing");
	}
	if (host === "localhost" || host === "127.0.0.1") return;

	// Worktree case: the dw registry records the branch DB minted for each
	// worktree (branch names are allowlisted as dw-wt-*/capy-*). Only that
	// exact host may be written to.
	const { homedir } = await import("node:os");
	const { join } = await import("node:path");
	const registryPath = join(homedir(), ".autumn-worktrees.json");
	try {
		const registry = JSON.parse(await Bun.file(registryPath).text()) as Record<
			string,
			{ databaseUrl?: string }
		>;
		const registeredHosts = Object.values(registry)
			.map((entry) => {
				try {
					return new URL(entry.databaseUrl ?? "").hostname;
				} catch {
					return "";
				}
			})
			.filter(Boolean);
		if (registeredHosts.includes(host)) return;
	} catch {
		// no registry → fall through to refusal
	}
	throw new Error(
		`DATABASE_URL host is "${host}" — not localhost and not a registered dw worktree branch; refusing to create eval orgs`,
	);
};

const main = async () => {
	const [command, runId] = process.argv.slice(2);
	await assertDevDatabase();
	const { db, client } = (
		await import("@server/db/initDrizzle.js")
	).initDrizzle();
	try {
		if (command === "create" && runId) {
			const result = await createEvalOrg({ db, runId });
			console.log(JSON.stringify(result));
		} else if (command === "delete" && runId) {
			await deleteEvalOrg({ db, orgId: orgIdFor(runId) });
			console.log(JSON.stringify({ deleted: orgIdFor(runId) }));
		} else if (command === "sweep") {
			const count = await sweepEvalOrgs({ db });
			console.log(JSON.stringify({ swept: count }));
		} else {
			console.error("usage: evalOrg.ts <create|delete> <runId> | sweep");
			process.exit(1);
		}
	} finally {
		await client.end();
	}
};

main()
	.then(() => {
		// Redis clients opened at import (clearOrg deps) hold the loop open.
		process.exit(0);
	})
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	});

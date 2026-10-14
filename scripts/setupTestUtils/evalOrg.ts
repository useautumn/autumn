#!/usr/bin/env bun
import { AppEnv, organizations } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import {
	ApiKeyPrefix,
	createKey,
} from "@server/internal/dev/apiKeys/apiKeyUtils.js";
import { clearOrgDbOnly } from "@tests/utils/setup/clearOrg.js";
import { and, eq, like, lt } from "drizzle-orm";

const SLUG_PREFIX = "test-ax-eval-";
const SWEEP_AGE_MS = 24 * 60 * 60 * 1000;

const orgIdFor = (runId: string) => `${SLUG_PREFIX}${runId}`;

const createEvalOrg = async ({
	db,
	runId,
	withStripe,
}: {
	db: DrizzleCli;
	runId: string;
	withStripe: boolean;
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
	if (withStripe) await bindStripeAccount({ db, orgId, runId });
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

const bindStripeAccount = async ({
	db,
	orgId,
	runId,
}: {
	db: DrizzleCli;
	orgId: string;
	runId: string;
}): Promise<void> => {
	const { createConnectAccount } = await import(
		"@server/internal/orgs/orgUtils/createConnectAccount.js"
	);
	const account = await createConnectAccount({
		org: { id: orgId, name: `AX Eval ${runId}` } as never,
		user: { email: "ax-evals@useautumn.com" } as never,
		metadata: { ax_eval: runId },
	});
	await db
		.update(organizations)
		.set({ test_stripe_connect: { default_account_id: account.id } })
		.where(eq(organizations.id, orgId));
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

const assertDevDatabase = async () => {
	const url = process.env.DATABASE_URL ?? "";
	let host = "";
	try {
		host = new URL(url).hostname;
	} catch {
		throw new Error("DATABASE_URL is unset or unparseable — refusing");
	}
	if (host === "localhost" || host === "127.0.0.1") return;

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
	} catch {}
	throw new Error(
		`DATABASE_URL host is "${host}" — not localhost and not a registered dw worktree branch; refusing to create eval orgs`,
	);
};

const main = async () => {
	const args = process.argv.slice(2);
	const withStripe = args.includes("--stripe");
	const [command, runId] = args.filter((arg) => arg !== "--stripe");
	await assertDevDatabase();
	const { db, client } = (
		await import("@server/db/initDrizzle.js")
	).initDrizzle({
		databaseUrl: process.env.DATABASE_URL,
	});
	try {
		if (command === "create" && runId) {
			const result = await createEvalOrg({ db, runId, withStripe });
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

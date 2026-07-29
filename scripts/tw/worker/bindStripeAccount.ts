#!/usr/bin/env bun
/**
 * In-sandbox worker step: bind a Stripe Connect sub-account into the worker's
 * LOCALHOST org row (plan §6a, §9a).
 *
 * Per §9a the orchestrator already created the sub-account + registered its
 * webhook (it holds the platform Stripe key and the run registry) and recorded
 * the ids before anything could fail. The worker's only job here is step 2 of
 * the §6a recipe: write `test_stripe_connect.default_account_id` into its own
 * localhost DB so `orgToAccountId` resolves the sub-account and
 * `createStripeCli({ org, env })` returns a sub-account-scoped client
 * (`connectUtils.ts:22`, `connectUtils.ts:84-87`).
 *
 * §6a gotcha: this MUST target the hardcoded unit-test-org id — every worker
 * shares that org id (the same id is baked into the warm snapshot's seed). The
 * id is sourced from `TEST_ORG_CONFIG` so it stays in lockstep with the seed.
 *
 * Idempotent: re-running with the same account id is a no-op-equivalent write
 * (it just re-sets the same value), and existing `test_stripe_connect` fields
 * are preserved.
 *
 * Inputs (argv takes precedence over env):
 *   - ORG_ID            (defaults to the hardcoded unit-test-org id)
 *   - STRIPE_ACCOUNT_ID (the `acct_*` minted by the orchestrator)
 *
 * Usage:
 *   bun scripts/tw/worker/bindStripeAccount.ts <orgId> <stripeAccountId>
 *   ORG_ID=... STRIPE_ACCOUNT_ID=... bun scripts/tw/worker/bindStripeAccount.ts
 */

import chalk from "chalk";

const DEFAULT_CURRENCY = "usd";

const resolveArg = (
	positional: string | undefined,
	envValue: string | undefined,
): string | undefined =>
	positional ?? (envValue && envValue.length > 0 ? envValue : undefined);

export const bindStripeAccount = async ({
	orgId,
	stripeAccountId,
}: {
	orgId: string;
	stripeAccountId: string;
}): Promise<void> => {
	// Dynamic import so the server DB pools are constructed only after the caller
	// (boot.ts) has set the localhost DATABASE_URL/DATABASE_CRITICAL_URL env.
	const { db } = await import("@server/db/initDrizzle.js");
	const { OrgService } = await import("@server/internal/orgs/OrgService.js");

	const org = await OrgService.get({ db, orgId });

	const updated = await OrgService.update({
		db,
		orgId,
		updates: {
			default_currency: DEFAULT_CURRENCY,
			test_stripe_connect: {
				...(org.test_stripe_connect ?? {}),
				default_account_id: stripeAccountId,
			},
		},
	});

	if (!updated) {
		throw new Error(
			`[bindStripeAccount] OrgService.update returned no row for org ${orgId} — org not found in the worker's localhost DB`,
		);
	}

	console.log(
		chalk.green(
			`[bindStripeAccount] bound ${stripeAccountId} to org ${orgId} (test_stripe_connect.default_account_id)`,
		),
	);
};

const main = async (): Promise<void> => {
	const [positionalOrgId, positionalAccountId] = process.argv.slice(2);

	const { TEST_ORG_CONFIG } = await import(
		"../../setupTestUtils/createTestOrg.js"
	);

	const orgId =
		resolveArg(positionalOrgId, process.env.ORG_ID) ?? TEST_ORG_CONFIG.id;
	const stripeAccountId = resolveArg(
		positionalAccountId,
		process.env.STRIPE_ACCOUNT_ID,
	);

	if (!stripeAccountId) {
		throw new Error(
			"[bindStripeAccount] missing STRIPE_ACCOUNT_ID — pass it as the 2nd argument or set STRIPE_ACCOUNT_ID",
		);
	}

	await bindStripeAccount({ orgId, stripeAccountId });

	// Close the DB pool so the script process exits cleanly.
	const { client } = await import("@server/db/initDrizzle.js");
	await client.end().catch(() => {
		// best-effort; the process is exiting anyway
	});
};

// Run only when invoked directly (not when imported by boot.ts).
if (import.meta.main) {
	main().catch((error) => {
		console.error(
			chalk.red(`[bindStripeAccount] failed: ${(error as Error).message}`),
		);
		process.exit(1);
	});
}

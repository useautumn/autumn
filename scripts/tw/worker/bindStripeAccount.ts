#!/usr/bin/env bun

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

	const { client } = await import("@server/db/initDrizzle.js");
	await client.end().catch(() => {});
};

if (import.meta.main) {
	main().catch((error) => {
		console.error(
			chalk.red(`[bindStripeAccount] failed: ${(error as Error).message}`),
		);
		process.exit(1);
	});
}

#!/usr/bin/env bun
import { AppEnv, organizations } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@server/db/initDrizzle.js";
import { createStripeCli } from "@server/external/connect/createStripeCli.js";
import { initMasterStripe } from "@server/external/connect/initStripeCli.js";
import { OrgService } from "@server/internal/orgs/OrgService.js";
import { clearOrgCache } from "@server/internal/orgs/orgUtils/clearOrgCache.js";
import { loadLocalEnv } from "@server/utils/envUtils.js";

loadLocalEnv();

const args = process.argv.slice(2);

const readFlag = (name: string) => {
	const inline = args.find((arg) => arg.startsWith(`${name}=`));
	if (inline) return inline.slice(name.length + 1);

	const idx = args.indexOf(name);
	return idx === -1 ? undefined : args[idx + 1];
};

const hasFlag = (name: string) => args.includes(name);

const usage = () => {
	console.log(`Usage:
  bun stripe:link-test -- --account-id=acct_...
  bun stripe:link-test -- --latest --email=unit-test-org@test.com
  bun stripe:link-test -- --list --email=unit-test-org@test.com

Options:
  --org=<slug-or-id>       Autumn org to update. Defaults to TESTS_ORG.
  --env=<sandbox|live>     Stripe environment. Defaults to sandbox.
  --account-id=<acct_...>  Connected Stripe account ID to link.
  --email=<email>          Filter Stripe connected accounts by email.
  --latest                 Link the newest connected account matching --email.
  --clear-secret-key       Clear the org's direct Stripe key for this env so Connect is used.
  --list                   Print matching connected accounts without updating.
`);
};

if (hasFlag("--help") || hasFlag("-h")) {
	usage();
	process.exit(0);
}

const env =
	(readFlag("--env") || "sandbox").toLowerCase() === "live"
		? AppEnv.Live
		: AppEnv.Sandbox;
const orgRef = readFlag("--org") || process.env.TESTS_ORG;
const email = readFlag("--email");
const accountIdArg = readFlag("--account-id");

if (!orgRef) {
	throw new Error("Missing org. Pass --org=<slug-or-id> or set TESTS_ORG.");
}

const { db, client } = initDrizzle();

const getOrg = async () => {
	const bySlug = await OrgService.getBySlug({ db, slug: orgRef });
	if (bySlug) return bySlug;

	return await OrgService.get({ db, orgId: orgRef });
};

const listAccounts = async () => {
	const stripe = initMasterStripe({ env, skipInstrumentation: true });
	const accounts = await stripe.accounts.list({ limit: 100 });

	return accounts.data
		.filter((account) => !email || account.email === email)
		.sort((a, b) => b.created - a.created);
};

try {
	const org = await getOrg();
	const accounts = await listAccounts();

	if (hasFlag("--list")) {
		console.log(
			JSON.stringify(
				accounts.map((account) => ({
					id: account.id,
					email: account.email,
					created: new Date(account.created * 1000).toISOString(),
					charges_enabled: account.charges_enabled,
					details_submitted: account.details_submitted,
				})),
				null,
				2,
			),
		);
		process.exit(0);
	}

	const accountId =
		accountIdArg || (hasFlag("--latest") ? accounts[0]?.id : undefined);

	if (!accountId) {
		throw new Error(
			"Missing account. Pass --account-id=acct_... or use --latest with --email=...",
		);
	}

	const directKeyField =
		env === AppEnv.Sandbox ? "test_api_key" : "live_api_key";
	const directWebhookSecretField =
		env === AppEnv.Sandbox ? "test_webhook_secret" : "live_webhook_secret";
	const hasDirectKey = Boolean(org.stripe_config?.[directKeyField]);

	if (hasDirectKey && !hasFlag("--clear-secret-key")) {
		throw new Error(
			`${org.slug} has stripe_config.${directKeyField}; createStripeCli will prefer that over Connect. Re-run with --clear-secret-key to use the OAuth account.`,
		);
	}

	const stripe = initMasterStripe({ env, accountId, skipInstrumentation: true });
	await stripe.accounts.retrieve();

	await OrgService.updateStripeConnect({
		db,
		orgId: org.id,
		accountId,
		env,
	});

	if (hasDirectKey) {
		await db
			.update(organizations)
			.set({
				stripe_config: {
					...(org.stripe_config || {}),
					[directKeyField]: null,
					[directWebhookSecretField]: null,
				},
			})
			.where(eq(organizations.id, org.id));
		await clearOrgCache({ db, orgId: org.id });
	}

	const updatedOrg = await OrgService.get({ db, orgId: org.id });
	const resolvedStripe = createStripeCli({
		org: updatedOrg,
		env,
		skipInstrumentation: true,
	});
	const resolvedAccount = await resolvedStripe.accounts.retrieve();

	console.log(
		JSON.stringify(
			{
				org: { id: updatedOrg.id, slug: updatedOrg.slug },
				env,
				linked_account_id: accountId,
				resolved_account_id: resolvedAccount.id,
				test_stripe_connect: updatedOrg.test_stripe_connect,
				live_stripe_connect: updatedOrg.live_stripe_connect,
			},
			null,
			2,
		),
	);
} finally {
	await client.end();
}

process.exit(0);

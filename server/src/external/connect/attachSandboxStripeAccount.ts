import { type AppEnv, type Organization, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import {
	MAIN_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "@server/external/stripe/common/stripeConstants.js";
import { OrgService } from "@server/internal/orgs/OrgService.js";
import { createConnectAccount } from "@server/internal/orgs/orgUtils/createConnectAccount.js";
import type { User } from "better-auth";
import { createStripeCli } from "./createStripeCli.js";

/**
 * Per-worker Stripe bring-up for `bun tw` sandboxes — the half of
 * `afterOrgCreated` the warm parent skips (`createStripeAccount: false`).
 *
 * It mints a Stripe Connect sub-account, binds it into the worker's LOCAL db as
 * `test_stripe_connect.default_account_id` (NO `master_org_id`, so
 * `shouldUseMaster` stays false and `createStripeCli` routes through
 * `initMasterStripe({ accountId })`), then registers a webhook endpoint ON THE
 * SUB-ACCOUNT (scoped client, NO `connect: true`) at the legacy route
 * `/webhooks/stripe/<orgId>/<env>`. Because the endpoint lives on the
 * sub-account, Stripe only delivers that sub-account's events there, so every
 * worker stays isolated even though they all share the same hardcoded org id.
 *
 * This is the canonical single-call version, primarily for reference/local use.
 * The orchestrator (see §9a) splits create-vs-bind across the platform key and
 * the worker DB so a worker dying mid-bring-up can't orphan an untracked
 * sub-account.
 */
export const attachSandboxStripeAccount = async ({
	db,
	org,
	user,
	env,
	publicUrl,
	metadata,
}: {
	db: DrizzleCli;
	org: Organization;
	user: User;
	env: AppEnv;
	publicUrl: string;
	metadata?: Record<string, string>;
}) => {
	// 1. Mint the sub-account via the master sandbox key.
	const account = await createConnectAccount({ org, user, metadata });

	// 2. Bind in the LOCAL db — default_account_id only, NO master_org_id.
	//    OrgService.update clears the org cache and returns the updated row.
	const updatedOrg = await OrgService.update({
		db,
		orgId: org.id,
		updates: {
			default_currency: "usd",
			test_stripe_connect: {
				...(org.test_stripe_connect ?? {}),
				default_account_id: account.id,
			},
		},
	});

	if (!updatedOrg) {
		throw new RecaseError({
			message: `attachSandboxStripeAccount: org ${org.id} not found when binding default_account_id`,
		});
	}

	// 3. Sub-account-scoped client off the UPDATED org (a stale org would throw
	//    "no Stripe account linked" inside createStripeCli).
	const stripeCli = createStripeCli({ org: updatedOrg, env });

	// 4. Webhook ON THE SUB-ACCOUNT, legacy route, NO connect:true. With
	//    STRIPE_WEBHOOK_SKIP_VERIFY=true the seeder never reads the signing
	//    secret, so we deliberately skip storing it.
	await stripeCli.webhookEndpoints.create({
		url: `${publicUrl}/webhooks/stripe/${org.id}/${env}`,
		enabled_events: [...MAIN_STRIPE_EVENT_TYPES, ...SYNC_STRIPE_EVENT_TYPES],
	});

	return { account, org: updatedOrg };
};

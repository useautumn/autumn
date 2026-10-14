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
	const account = await createConnectAccount({ org, user, metadata });

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

	const stripeCli = createStripeCli({ org: updatedOrg, env });

	await stripeCli.webhookEndpoints.create({
		url: `${publicUrl}/webhooks/stripe/${org.id}/${env}`,
		enabled_events: [...MAIN_STRIPE_EVENT_TYPES, ...SYNC_STRIPE_EVENT_TYPES],
	});

	return { account, org: updatedOrg };
};

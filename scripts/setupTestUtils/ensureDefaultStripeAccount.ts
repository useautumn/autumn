import chalk from "chalk";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { OrgService } from "@server/internal/orgs/OrgService.js";
import { createConnectAccount } from "@server/internal/orgs/orgUtils/createConnectAccount.js";

const DUMMY_USER = {
	id: "setup-test-stripe-user",
	email: "setup-test@autumn.test",
	name: "Setup Test User",
};

/**
 * Idempotently ensure the test org has a default Stripe Connect sandbox
 * account. Creates one only if `test_stripe_connect.default_account_id`
 * is missing.
 */
export async function ensureDefaultStripeAccount({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}): Promise<void> {
	const org = await OrgService.get({ db, orgId });

	const existingAccountId = org.test_stripe_connect?.default_account_id;
	if (existingAccountId) {
		console.log(
			chalk.yellowBright(
				`Stripe default account already connected (${existingAccountId}). Skipping.`,
			),
		);
		return;
	}

	console.log(chalk.blue("   🔄 Creating default Stripe sandbox account..."));

	const newAccount = await createConnectAccount({
		org: org as any,
		user: DUMMY_USER as any,
	});

	await OrgService.update({
		db,
		orgId,
		updates: {
			test_stripe_connect: {
				...org.test_stripe_connect,
				default_account_id: newAccount.id,
			},
		},
	});

	console.log(
		chalk.greenBright(
			`   ✅ Created default Stripe sandbox account: ${newAccount.id}`,
		),
	);
}

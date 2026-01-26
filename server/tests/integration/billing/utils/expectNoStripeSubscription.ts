import { expect } from "bun:test";
import type { AppEnv, Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { CusService } from "@/internal/customers/CusService";

/**
 * Verifies that a customer has no active Stripe subscriptions.
 * Use after cancel immediately or after advancing past cancel end of cycle.
 */
export const expectNoStripeSubscription = async ({
	db,
	customerId,
	org,
	env,
}: {
	db: DrizzleCli;
	customerId: string;
	org: Organization;
	env: AppEnv;
}) => {
	const stripeCli = createStripeCli({ org, env });

	const customer = await CusService.get({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
	});

	if (!customer?.processor?.id) {
		// No Stripe customer = no subscriptions, which is valid
		return;
	}

	const subs = await stripeCli.subscriptions.list({
		customer: customer.processor.id,
	});

	expect(
		subs.data.length,
		`Expected customer ${customerId} to have no Stripe subscriptions, but found ${subs.data.length}`,
	).toBe(0);
};

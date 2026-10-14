import { type Customer, orgDisableStripeWrites } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { autumnStripeRequestOptions } from "@/external/stripe/common/autumnStripeIdempotency";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import type { ExpandedStripeCustomer } from "./getExpandedStripeCustomer";

/** The caller's customer may be a snapshot taken before a concurrent
 * customers.update committed; pushing its email to Stripe would echo the stale
 * value back through the customer.updated webhook and overwrite the new one. */
const latestCustomerEmail = async ({
	ctx,
	customer,
}: {
	ctx: AutumnContext;
	customer: Customer;
}) => {
	const idOrInternalId = customer.id || customer.internal_id;
	if (!idOrInternalId) return customer.email;
	const current = await CusService.get({
		db: ctx.db,
		env: ctx.env,
		idOrInternalId,
		orgId: ctx.org.id,
	});
	return current?.email ?? customer.email;
};

export const syncStripeCustomerEmail = async ({
	ctx,
	customer,
	stripeCustomer,
}: {
	ctx: AutumnContext;
	customer: Customer;
	stripeCustomer: ExpandedStripeCustomer;
}): Promise<ExpandedStripeCustomer> => {
	const email = await latestCustomerEmail({ ctx, customer });
	if (
		!email ||
		stripeCustomer.email === email ||
		orgDisableStripeWrites({ ctx })
	) {
		return stripeCustomer;
	}

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	await stripeCli.customers.update(
		stripeCustomer.id,
		{ email },
		autumnStripeRequestOptions({ source: "customer.update" }),
	);
	return { ...stripeCustomer, email };
};

import { CusService } from "@/internal/customers/CusService.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";

/** The Stripe customer id behind an Autumn customer, for scoping Stripe queries. */
export const stripeCustomerId = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}): Promise<string> => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const stripeId = customer?.processor?.id;
	if (!stripeId) {
		throw new Error(`Customer ${customerId} has no Stripe customer`);
	}

	return stripeId;
};

import type { Customer } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import {
	type ExpandedStripeCustomer,
	getExpandedStripeCustomer,
} from "./getExpandedStripeCustomer";

const searchStripeCustomerIdByAutumnInternalId = async ({
	ctx,
	internalId,
}: {
	ctx: AutumnContext;
	internalId: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const { data } = await stripeCli.customers.search({
		query: `metadata['autumn_internal_id']:'${internalId}'`,
		limit: 1,
	});
	return data[0]?.id;
};

export const findStripeCustomerForAutumnCustomer = async ({
	ctx,
	customer,
	expandTax,
}: {
	ctx: AutumnContext;
	customer: Customer;
	expandTax?: boolean;
}): Promise<ExpandedStripeCustomer | undefined> => {
	const latestCustomer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customer.internal_id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const stripeCustomerId =
		latestCustomer?.processor?.id ??
		(await searchStripeCustomerIdByAutumnInternalId({
			ctx,
			internalId: customer.internal_id,
		}));

	return getExpandedStripeCustomer({ ctx, stripeCustomerId, expandTax });
};
